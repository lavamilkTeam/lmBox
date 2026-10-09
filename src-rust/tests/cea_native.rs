#![cfg(all(feature = "cea-integration", not(target_arch = "wasm32")))]
use lmbox::{app::CeaBackend, contracts::thermochemistry::*};
use std::{
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};

fn runtime() -> PathBuf {
    std::env::var_os("LMBOX_CEA_RUNTIME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.tools/cea/runtime"))
}
fn request() -> CeaRequest {
    serde_json::from_str(include_str!(
        "../../contracts/fixtures/v1/cea-rocket-request.json"
    ))
    .unwrap()
}
fn close(actual: f64, expected: f64, tolerance: f64) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "actual={actual}, expected={expected}, tolerance={tolerance}"
    );
}
fn stations(result: CeaResult) -> Vec<RocketStation> {
    match result.solution {
        Solution::Rocket { stations } => stations,
        _ => panic!("expected rocket"),
    }
}

#[test]
fn official_rp1311_example8_in_si_units() {
    // NASA v3.3.4 test/main_interface/reference_output/example8.out.
    // Allow the published solver's iteration tolerances, not a wrapper-generated baseline.
    let input = request();
    let result = CeaBackend::load(runtime()).unwrap().solve(&input).unwrap();
    assert_eq!(result.project_id, input.project_id);
    assert_eq!(result.job_id, input.job_id);
    assert_eq!(result.input_revision, input.input_revision);
    let schema: serde_json::Value = serde_json::from_str(include_str!(
        "../../contracts/schemas/v1/cea-result.schema.json"
    ))
    .unwrap();
    jsonschema::validator_for(&schema)
        .unwrap()
        .validate(&serde_json::to_value(&result).unwrap())
        .unwrap();
    let s = stations(result);
    assert_eq!(s.len(), 5);
    assert!(s[0].performance.is_none());
    close(s[0].state.temperature_k, 3383.84462594510, 0.2);
    close(s[0].state.enthalpy_j_kg, -1026054.93530542, 100.0);
    close(s[0].state.cp_j_kg_k, 8325.30666015866, 2.0);
    close(s[1].mach, 1.0, 0.001);
    close(s[2].state.pressure_pa, 20491.2681292445, 20.0);
    close(s[2].state.temperature_k, 1468.15621334024, 1.0);
    let p = s[2].performance.as_ref().unwrap();
    close(p.area_ratio, 25.0, 0.01);
    close(p.c_star_m_s, 2332.33560769645, 0.5);
    close(p.matched_thrust_coefficient, 1.76836250709485, 0.001);
    close(
        p.matched_specific_impulse_s,
        4124.41484261268 / 9.80665,
        0.1,
    );
    close(p.vacuum_specific_impulse_s, 4348.51382282217 / 9.80665, 0.1);
    close(s[4].state.temperature_k, 1088.64365096658, 1.0);
}

#[test]
fn equilibrium_constraints_and_frozen_composition() {
    let backend = CeaBackend::load(runtime()).unwrap();
    let mut input = request();
    let equilibrium = stations(backend.solve(&input).unwrap());
    input.calculation = Calculation::Hp {
        pressure_pa: 5331720.0,
    };
    let Solution::Equilibrium { state } = backend.solve(&input).unwrap().solution else {
        panic!()
    };
    close(state.temperature_k, equilibrium[0].state.temperature_k, 0.1);
    input.calculation = Calculation::Tp {
        temperature_k: state.temperature_k,
        pressure_pa: state.pressure_pa,
    };
    let Solution::Equilibrium { state: tp } = backend.solve(&input).unwrap().solution else {
        panic!()
    };
    close(tp.enthalpy_j_kg, state.enthalpy_j_kg, 50.0);
    for (mode, freeze_index) in [
        (RocketChemistry::FrozenAtChamber, 0),
        (RocketChemistry::FrozenAtThroat, 1),
    ] {
        input.calculation = Calculation::Rocket {
            chamber_pressure_pa: 5331720.0,
            exit_area_ratios: vec![25.0, 50.0],
            chemistry: mode,
        };
        let frozen = stations(backend.solve(&input).unwrap());
        for (a, b) in frozen[freeze_index]
            .state
            .species
            .iter()
            .zip(&frozen[3].state.species)
        {
            assert_eq!(a.species, b.species);
            close(a.mass_fraction, b.mass_fraction, 1e-12);
        }
        assert!(
            frozen[2]
                .performance
                .as_ref()
                .unwrap()
                .vacuum_specific_impulse_s
                < equilibrium[2]
                    .performance
                    .as_ref()
                    .unwrap()
                    .vacuum_specific_impulse_s
        );
    }
}

#[test]
fn invalid_requests_do_not_damage_subsequent_solves() {
    let backend = CeaBackend::load(runtime()).unwrap();
    let base = request();
    let mut invalid = base.clone();
    invalid.reactants[0].species = "NoSuchSpecies".into();
    assert!(backend.solve(&invalid).is_err());
    invalid = base.clone();
    invalid.reactants[0].temperature_k = 300.0; // outside the liquid H2 database range
    assert!(backend.solve(&invalid).is_err());
    invalid = base.clone();
    invalid.reactants[0].mass_fraction = f64::NAN;
    assert!(backend.solve(&invalid).is_err());
    invalid = base.clone();
    invalid.schema_version = 2;
    assert!(backend.solve(&invalid).is_err());
    invalid = base.clone();
    invalid.calculation = Calculation::Hp { pressure_pa: -1.0 };
    assert!(backend.solve(&invalid).is_err());
    invalid.calculation = Calculation::Rocket {
        chamber_pressure_pa: 1e5,
        exit_area_ratios: vec![25.0, 2.0],
        chemistry: RocketChemistry::Equilibrium,
    };
    assert!(backend.solve(&invalid).is_err());
    invalid = base.clone();
    invalid.calculation = Calculation::Tp {
        temperature_k: 1.0,
        pressure_pa: 1e5,
    };
    assert!(backend
        .solve(&invalid)
        .unwrap_err()
        .to_string()
        .contains("not converged"));
    assert!(backend.solve(&base).unwrap().converged);
}

#[test]
fn callers_are_serialized_and_keep_their_task_identity() {
    let threads: Vec<_> = (0..4)
        .map(|i| {
            std::thread::spawn(move || {
                let backend = CeaBackend::load(runtime()).unwrap();
                let mut input = request();
                input.job_id = format!("parallel-{i}");
                input.input_revision = i;
                for _ in 0..3 {
                    let result = backend.solve(&input).unwrap();
                    assert_eq!(result.job_id, input.job_id);
                    assert_eq!(result.input_revision, i);
                }
            })
        })
        .collect();
    for thread in threads {
        thread.join().unwrap();
    }
}

#[test]
fn cli_emits_only_json_and_fails_for_missing_runtime() {
    let relocated = tempfile::tempdir().unwrap();
    let copied = relocated.path().join("cea runtime with spaces");
    std::fs::create_dir(&copied).unwrap();
    for entry in std::fs::read_dir(runtime()).unwrap() {
        let entry = entry.unwrap();
        if entry.path().is_file() {
            std::fs::copy(entry.path(), copied.join(entry.file_name())).unwrap();
        }
    }
    let mut child = Command::new(env!("CARGO_BIN_EXE_cea"))
        .arg(&copied)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(&serde_json::to_vec(&request()).unwrap())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result: CeaResult = serde_json::from_slice(&output.stdout).unwrap();
    assert!(result.converged);
    let empty = tempfile::tempdir().unwrap();
    assert!(CeaBackend::load(empty.path()).is_err());
    let mut child = Command::new(env!("CARGO_BIN_EXE_cea"))
        .arg(empty.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(&serde_json::to_vec(&request()).unwrap())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("thermo.lib"));
}
