#![cfg(all(feature = "cea-integration", not(target_arch = "wasm32")))]
use lmbox::{
    app::{CeaBackend, PropulsionBackend},
    contracts::{
        propulsion::*,
        thermochemistry::{RocketChemistry, Solution},
    },
};
use serde_json::Value;
use std::{
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};

fn runtime(name: &str) -> PathBuf {
    let env = if name == "cea" {
        "LMBOX_CEA_RUNTIME"
    } else {
        "LMBOX_PROPULSION_RUNTIME"
    };
    std::env::var_os(env).map(PathBuf::from).unwrap_or_else(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("../.tools/{name}/runtime"))
    })
}
fn backend() -> PropulsionBackend {
    PropulsionBackend::load(runtime("propulsion")).unwrap()
}
fn nozzle() -> NozzleRequest {
    let DesignRequest::Nozzle(r) = serde_json::from_str(include_str!(
        "../../contracts/fixtures/v1/propulsion-nozzle-request.json"
    ))
    .unwrap() else {
        panic!()
    };
    r
}
fn injector() -> InjectorRequest {
    let DesignRequest::Injector(r) = serde_json::from_str(include_str!(
        "../../contracts/fixtures/v1/propulsion-injector-request.json"
    ))
    .unwrap() else {
        panic!()
    };
    r
}
fn close(a: f64, b: f64, relative: f64) {
    assert!((a - b).abs() <= relative * b.abs().max(1e-16), "{a} != {b}");
}
fn validate_result(value: Value) {
    let schema: Value = serde_json::from_str(include_str!(
        "../../contracts/schemas/v1/propulsion-result.schema.json"
    ))
    .unwrap();
    let cea: Value = serde_json::from_str(include_str!(
        "../../contracts/schemas/v1/cea-result.schema.json"
    ))
    .unwrap();
    jsonschema::options()
        .with_resource(
            "https://lmbox.invalid/schemas/v1/cea-result.schema.json",
            jsonschema::Resource::from_contents(cea).unwrap(),
        )
        .build(&schema)
        .unwrap()
        .validate(&value)
        .unwrap();
}

#[test]
fn nozzle_uses_official_cea_reference_and_obeys_mass_flow_scaling() {
    let backend = backend();
    let cea = CeaBackend::load(runtime("cea")).unwrap();
    let mut r = nozzle();
    let first = backend.design_nozzle(&cea, &r).unwrap();
    // NASA RP-1311 example 8's published vacuum effective velocity (m/s).
    close(first.ideal_thrust_n, 4348.51382282217, 0.0001);
    close(
        first.ideal_specific_impulse_s,
        4348.51382282217 / 9.80665,
        0.0001,
    );
    close(first.throat_area_m2, 2332.33560769645 / 5331720.0, 0.0001);
    assert_eq!(first.identity.job_id, first.cea.job_id);
    assert_eq!(first.identity.input_revision, first.cea.input_revision);
    close(first.exit_radius_m / first.throat_radius_m, 5.0, 1e-14);
    validate_result(serde_json::to_value(DesignResult::Nozzle(Box::new(first.clone()))).unwrap());
    r.mass_flow_kg_s *= 4.0;
    let scaled = backend.design_nozzle(&cea, &r).unwrap();
    close(scaled.ideal_thrust_n, first.ideal_thrust_n * 4.0, 1e-12);
    close(scaled.throat_radius_m, first.throat_radius_m * 2.0, 1e-12);
    close(
        scaled.divergent_length_m,
        first.divergent_length_m * 2.0,
        1e-12,
    );
    close(
        scaled.ideal_specific_impulse_s,
        first.ideal_specific_impulse_s,
        1e-12,
    );
}

#[test]
fn pressure_thrust_and_frozen_modes_reuse_the_corresponding_fortran_solution() {
    let backend = backend();
    let cea = CeaBackend::load(runtime("cea")).unwrap();
    for chemistry in [
        RocketChemistry::Equilibrium,
        RocketChemistry::FrozenAtChamber,
        RocketChemistry::FrozenAtThroat,
    ] {
        let mut r = nozzle();
        r.chemistry = chemistry;
        let vacuum = backend.design_nozzle(&cea, &r).unwrap();
        let Solution::Rocket { stations } = &vacuum.cea.solution else {
            panic!()
        };
        let exit = stations.last().unwrap();
        r.ambient_pressure_pa = exit.state.pressure_pa;
        let matched = backend.design_nozzle(&cea, &r).unwrap();
        close(
            matched.ideal_specific_impulse_s,
            exit.performance
                .as_ref()
                .unwrap()
                .matched_specific_impulse_s,
            2e-7,
        );
        r.ambient_pressure_pa = 2.0 * exit.state.pressure_pa;
        let over = backend.design_nozzle(&cea, &r).unwrap();
        close(
            vacuum.ideal_thrust_n - over.ideal_thrust_n,
            r.ambient_pressure_pa * vacuum.exit_area_m2,
            1e-10,
        );
        assert_eq!(over.warnings.len(), 1);
    }
}

#[test]
fn quadratic_bell_has_correct_endpoints_and_tangent_connections() {
    let backend = backend();
    let cea = CeaBackend::load(runtime("cea")).unwrap();
    let mut r = nozzle();
    r.segments = 2048;
    r.contour = NozzleContour::QuadraticBell {
        length_over_throat_radius: 12.0,
        start_angle_deg: 30.0,
        exit_angle_deg: 8.0,
        throat_arc_radius_ratio: 0.5,
    };
    let result = backend.design_nozzle(&cea, &r).unwrap();
    assert!(result.conical_divergence_factor.is_none());
    assert_eq!(result.contour.len(), 4097);
    close(
        result.divergent_length_m,
        12.0 * result.throat_radius_m,
        1e-14,
    );
    let points = &result.contour;
    close(points[0].radius_m, result.throat_radius_m, 1e-14);
    assert_eq!(points[0].x_m, 0.0);
    close(points.last().unwrap().radius_m, result.exit_radius_m, 1e-14);
    for p in points.windows(2) {
        assert!(p[1].x_m > p[0].x_m && p[1].radius_m >= p[0].radius_m);
    }
    let slope = |a: usize, b: usize| {
        (points[b].radius_m - points[a].radius_m) / (points[b].x_m - points[a].x_m)
    };
    close(slope(2047, 2048), 30_f64.to_radians().tan(), 0.001);
    close(slope(2048, 2049), 30_f64.to_radians().tan(), 0.001);
    close(slope(4095, 4096), 8_f64.to_radians().tan(), 0.003);
    validate_result(serde_json::to_value(DesignResult::Nozzle(Box::new(result))).unwrap());
}

#[test]
fn liquid_passages_conserve_mass_and_reproduce_water_reference() {
    let backend = backend();
    let mut r = injector();
    let result = backend.design_injector(&r).unwrap();
    close(result.oxidizer.mass_flow_kg_s, 0.2, 1e-14);
    close(result.fuel.mass_flow_kg_s, 0.1, 1e-14);
    close(result.oxidizer.mean_velocity_m_s, 9.89949493661, 1e-11);
    close(result.oxidizer.outer_diameter_m, 0.00160384922355, 1e-11);
    close(result.fuel.outer_diameter_m, 0.00229916640675, 1e-11);
    close(
        result.fuel.hydraulic_diameter_m,
        result.fuel.outer_diameter_m - 0.002,
        1e-12,
    );
    for (input, output) in [(&r.oxidizer, &result.oxidizer), (&r.fuel, &result.fuel)] {
        let area = std::f64::consts::PI / 4.0
            * (output.outer_diameter_m.powi(2) - output.inner_diameter_m.powi(2));
        close(area, output.area_per_element_m2, 1e-12);
        close(
            area * input.element_count as f64 * output.mean_velocity_m_s * input.density_kg_m3,
            output.mass_flow_kg_s,
            1e-12,
        );
    }
    validate_result(
        serde_json::to_value(DesignResult::Injector(Box::new(result.clone()))).unwrap(),
    );
    r.oxidizer.element_count *= 4;
    let more = backend.design_injector(&r).unwrap();
    close(
        more.oxidizer.outer_diameter_m,
        result.oxidizer.outer_diameter_m / 2.0,
        1e-12,
    );
    close(
        more.oxidizer.mean_velocity_m_s,
        result.oxidizer.mean_velocity_m_s,
        1e-12,
    );
}

#[test]
fn invalid_numbers_geometry_and_identity_fail_without_poisoning_the_backend() {
    let backend = backend();
    let cea = CeaBackend::load(runtime("cea")).unwrap();
    for value in [f64::NAN, f64::INFINITY, 0.0, -1.0] {
        let mut r = injector();
        r.fuel.density_kg_m3 = value;
        assert!(backend.design_injector(&r).is_err());
        let mut n = nozzle();
        n.mass_flow_kg_s = value;
        assert!(backend.design_nozzle(&cea, &n).is_err());
    }
    for count in [0, 100001, u32::MAX] {
        let mut r = injector();
        r.fuel.element_count = count;
        assert!(backend.design_injector(&r).is_err());
    }
    for count in [0, 3, 2049, u32::MAX] {
        let mut r = nozzle();
        r.segments = count;
        assert!(backend.design_nozzle(&cea, &r).is_err());
    }
    let mut r = nozzle();
    r.contour = NozzleContour::QuadraticBell {
        length_over_throat_radius: 0.1,
        start_angle_deg: 30.0,
        exit_angle_deg: 8.0,
        throat_arc_radius_ratio: 0.5,
    };
    assert!(backend.design_nozzle(&cea, &r).is_err());
    let mut r = injector();
    r.fuel.discharge_coefficient = 1.1;
    assert!(backend.design_injector(&r).is_err());
    r = injector();
    r.identity.schema_version = 2;
    assert!(backend.design_injector(&r).is_err());
    r = injector();
    r.identity.project_id = "\n".into();
    assert!(backend.design_injector(&r).is_err());
    r = injector();
    r.fuel.passage = LiquidPassage::Annular {
        inner_diameter_m: 1e100,
    };
    assert!(backend.design_injector(&r).is_err());
    r = injector();
    r.total_mass_flow_kg_s = f64::MIN_POSITIVE;
    assert!(backend.design_injector(&r).is_err());
    assert!(backend.design_injector(&injector()).is_ok());
    assert!(backend.design_nozzle(&cea, &nozzle()).is_ok());
}

#[test]
fn independent_native_requests_preserve_identity_in_parallel() {
    let handles: Vec<_> = (0..4)
        .map(|id| {
            std::thread::spawn(move || {
                let backend = backend();
                for iteration in 0..8 {
                    let mut r = injector();
                    r.identity.job_id = format!("job-{id}");
                    r.identity.input_revision = iteration;
                    let result = backend.design_injector(&r).unwrap();
                    assert_eq!(result.identity.job_id, r.identity.job_id);
                    assert_eq!(result.identity.input_revision, iteration);
                    close(
                        result.oxidizer.mass_flow_kg_s + result.fuel.mass_flow_kg_s,
                        r.total_mass_flow_kg_s,
                        1e-14,
                    );
                }
            })
        })
        .collect();
    for handle in handles {
        handle.join().unwrap();
    }
}

#[test]
fn relocated_cli_needs_only_native_library_for_liquid_calculation_and_keeps_stdout_json() {
    let temp = tempfile::tempdir().unwrap();
    let copied = temp.path().join("runtime with spaces");
    std::fs::create_dir(&copied).unwrap();
    for item in std::fs::read_dir(runtime("propulsion")).unwrap() {
        let p = item.unwrap().path();
        if p.is_file() {
            std::fs::copy(&p, copied.join(p.file_name().unwrap())).unwrap();
        }
    }
    let run = |bytes: &[u8]| {
        let mut child = Command::new(env!("CARGO_BIN_EXE_propulsion"))
            .arg(&copied)
            .current_dir(temp.path())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child.stdin.take().unwrap().write_all(bytes).unwrap();
        child.wait_with_output().unwrap()
    };
    let result = run(include_bytes!(
        "../../contracts/fixtures/v1/propulsion-injector-request.json"
    ));
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    validate_result(serde_json::from_slice(&result.stdout).unwrap());
    for bad in [
        &b"{}"[..],
        include_bytes!("../../contracts/fixtures/v1/propulsion-nozzle-request.json"),
    ] {
        let result = run(bad);
        assert!(!result.status.success());
        assert!(result.stdout.is_empty());
        assert!(!result.stderr.is_empty());
    }
    let large = run(&vec![b' '; 65537]);
    assert!(!large.status.success());
    assert!(large.stdout.is_empty());
    let empty = temp.path().join("empty");
    std::fs::create_dir(&empty).unwrap();
    assert!(PropulsionBackend::load(empty).is_err());
}
