mod ffi;
use crate::contracts::thermochemistry::*;
use ffi::{Api, Handle};
use std::{
    ffi::{CStr, CString},
    path::{Path, PathBuf},
    sync::Mutex,
};

// CEA database initialization and C error recovery are process-global. Hold this
// lock through every native call AND handle destruction; never expose handles.
static ENGINE: Mutex<Option<Engine>> = Mutex::new(None);
struct Engine {
    root: PathBuf,
    api: Api,
}

#[cfg(target_os = "macos")]
const LIBRARY: &str = "libcea_bindc.dylib";
#[cfg(target_os = "linux")]
const LIBRARY: &str = "libcea_bindc.so";
#[cfg(target_os = "windows")]
const LIBRARY: &str = "libcea_bindc.dll";

pub(crate) fn initialize(root: &Path) -> Result<(), String> {
    let mut engine = ENGINE.lock().map_err(|_| "CEA runtime lock poisoned")?;
    if let Some(engine) = engine.as_ref() {
        return engine.check_root(root);
    }
    let database = root.join("thermo.lib");
    if !database.is_file() {
        return Err("CEA runtime is missing thermo.lib".into());
    }
    let database = CString::new(database.to_str().ok_or("CEA runtime path must be UTF-8")?)
        .map_err(|_| "CEA runtime path contains NUL")?;
    let api = Api::load(&root.join(LIBRARY))?;
    // SAFETY: function signatures match pinned C header; writable scalars and
    // NUL-terminated path are valid for the duration of each serialized call.
    unsafe {
        let mut version = [0; 3];
        for (i, getter) in [
            api.cea_version_major,
            api.cea_version_minor,
            api.cea_version_patch,
        ]
        .iter()
        .enumerate()
        {
            api.check(getter(&mut version[i]), "read CEA version")?;
        }
        if version != [3, 3, 4] {
            return Err(format!("expected CEA 3.3.4, found {version:?}"));
        }
        api.check((api.cea_set_log_level)(0), "disable native stdout logging")?;
        api.check(
            (api.cea_init_thermo)(database.as_ptr()),
            "load thermo database",
        )?;
    }
    *engine = Some(Engine {
        root: root.to_owned(),
        api,
    });
    Ok(())
}

pub(crate) fn solve(root: &Path, request: &CeaRequest) -> Result<Solution, String> {
    let engine = ENGINE.lock().map_err(|_| "CEA runtime lock poisoned")?;
    let engine = engine.as_ref().ok_or("CEA backend not initialized")?;
    engine.check_root(root)?;
    engine.solve(request)
}

impl Engine {
    fn check_root(&self, root: &Path) -> Result<(), String> {
        if self.root == root {
            Ok(())
        } else {
            Err("one CEA runtime directory is allowed per process".into())
        }
    }

    fn solve(&self, request: &CeaRequest) -> Result<Solution, String> {
        let api = &self.api;
        let names: Vec<_> = request
            .reactants
            .iter()
            .map(|r| CString::new(r.species.as_str()).map_err(|_| "invalid species name"))
            .collect::<Result<_, _>>()?;
        let pointers: Vec<_> = names.iter().map(|s| s.as_ptr()).collect();
        let weights: Vec<_> = request.reactants.iter().map(|r| r.mass_fraction).collect();
        let temperatures: Vec<_> = request.reactants.iter().map(|r| r.temperature_k).collect();
        let nr = names.len() as i32; // validated <= 32 by the feature boundary
        let mut reactants = Handle::new(api, api.cea_mixture_destroy);
        let mut products = Handle::new(api, api.cea_mixture_destroy);
        // SAFETY: requests were validated before entering this private adapter;
        // all slices outlive native calls, array sizes come from the live mixture,
        // handles are destroyed in reverse order before releasing ENGINE's lock.
        unsafe {
            for (name, r) in names.iter().zip(&request.reactants) {
                let (mut min, mut max) = (0.0, 0.0);
                api.check(
                    (api.cea_reactant_get_valid_temperature_range)(
                        name.as_ptr(),
                        &mut min,
                        &mut max,
                    ),
                    "lookup reactant",
                )?;
                if r.temperature_k < min || r.temperature_k > max {
                    return Err(format!(
                        "{} temperature must be within [{min}, {max}] K",
                        r.species
                    ));
                }
            }
            api.check(
                (api.cea_mixture_create)(&mut reactants.ptr, nr, pointers.as_ptr()),
                "create reactants",
            )?;
            api.check(
                (api.cea_mixture_create_from_reactants)(
                    &mut products.ptr,
                    nr,
                    pointers.as_ptr(),
                    0,
                    std::ptr::null(),
                ),
                "create products",
            )?;
            let mut np = 0;
            api.check(
                (api.cea_mixture_get_num_species)(products.ptr, &mut np),
                "count products",
            )?;
            if !(1..=10000).contains(&np) {
                return Err("invalid product count".into());
            }
            let mut names_buf = vec![0; np as usize * 16];
            api.check(
                (api.cea_mixture_get_species_names_buf)(
                    &products.ptr,
                    np,
                    names_buf.as_mut_ptr(),
                    16,
                ),
                "read product names",
            )?;
            let product_names: Vec<_> = names_buf
                .chunks(16)
                .map(|s| {
                    // Pinned API guarantees NUL in each 16-byte slot (max name 15).
                    CStr::from_ptr(s.as_ptr())
                        .to_string_lossy()
                        .trim()
                        .to_owned()
                })
                .collect();
            let mut inlet_enthalpy = 0.0;
            api.check(
                (api.cea_mixture_calc_property_multitemp)(
                    reactants.ptr,
                    6,
                    nr,
                    weights.as_ptr(),
                    nr,
                    temperatures.as_ptr(),
                    &mut inlet_enthalpy,
                ),
                "reactant enthalpy",
            )?;
            // Mixture enthalpy is J/kg; constraints require h/R, R=8314.51 J/kmol/K.
            let hc = inlet_enthalpy / 8314.51;
            match &request.calculation {
                Calculation::Tp {
                    temperature_k,
                    pressure_pa,
                } => self.equilibrium(
                    &reactants,
                    &products,
                    &weights,
                    &product_names,
                    0,
                    *temperature_k,
                    *pressure_pa,
                ),
                Calculation::Hp { pressure_pa } => self.equilibrium(
                    &reactants,
                    &products,
                    &weights,
                    &product_names,
                    1,
                    hc,
                    *pressure_pa,
                ),
                Calculation::Rocket {
                    chamber_pressure_pa,
                    exit_area_ratios,
                    chemistry,
                } => {
                    let mut solver = Handle::new(api, api.cea_rocket_solver_destroy);
                    api.check(
                        (api.cea_rocket_solver_create_with_reactants)(
                            &mut solver.ptr,
                            products.ptr,
                            reactants.ptr,
                        ),
                        "create rocket solver",
                    )?;
                    let mut solution = Handle::new(api, api.cea_rocket_solution_destroy);
                    api.check(
                        (api.cea_rocket_solution_create)(&mut solution.ptr, solver.ptr),
                        "create rocket solution",
                    )?;
                    let freeze = match chemistry {
                        RocketChemistry::Equilibrium => 0,
                        RocketChemistry::FrozenAtChamber => 1,
                        RocketChemistry::FrozenAtThroat => 2,
                    };
                    // Empty optional arrays are backed by valid storage even at length 0.
                    let empty = [0.0];
                    api.check(
                        (api.cea_rocket_solver_solve_iac)(
                            solver.ptr,
                            solution.ptr,
                            weights.as_ptr(),
                            chamber_pressure_pa / 1e5,
                            empty.as_ptr(),
                            0,
                            empty.as_ptr(),
                            0,
                            exit_area_ratios.as_ptr(),
                            exit_area_ratios.len() as i32,
                            freeze,
                            hc,
                            true,
                            0.0,
                            false,
                        ),
                        "solve rocket",
                    )?;
                    let mut converged = 0;
                    api.check(
                        (api.cea_rocket_solution_get_converged)(solution.ptr, &mut converged),
                        "rocket convergence",
                    )?;
                    if converged != 1 {
                        return Err("rocket calculation did not converge".into());
                    }
                    let mut n = 0;
                    api.check(
                        (api.cea_rocket_solution_get_size)(solution.ptr, &mut n),
                        "station count",
                    )?;
                    if n as usize != exit_area_ratios.len() + 2 {
                        return Err("unexpected rocket station count".into());
                    }
                    let mut properties = vec![vec![0.0; n as usize]; 22];
                    for (prop, values) in properties.iter_mut().enumerate() {
                        api.check(
                            (api.cea_rocket_solution_get_property)(
                                solution.ptr,
                                prop as i32,
                                n,
                                values.as_mut_ptr(),
                            ),
                            "rocket property",
                        )?;
                    }
                    let mut stations = Vec::new();
                    for i in 0..n as usize {
                        let mut fractions = vec![0.0; np as usize];
                        api.check(
                            (api.cea_rocket_solution_get_species_amounts)(
                                solution.ptr,
                                np,
                                i as i32 + 1,
                                fractions.as_mut_ptr(),
                                true,
                            ),
                            "rocket composition",
                        )?;
                        let p: Vec<_> = properties.iter().map(|v| v[i]).collect();
                        let performance = if i == 0 {
                            None
                        } else {
                            for value in &p[17..22] {
                                finite(*value)?;
                            }
                            Some(RocketPerformance {
                                area_ratio: p[17],
                                c_star_m_s: p[18],
                                matched_thrust_coefficient: p[19],
                                matched_specific_impulse_s: p[20] / 9.80665,
                                vacuum_specific_impulse_s: p[21] / 9.80665,
                            })
                        };
                        stations.push(RocketStation {
                            kind: match i {
                                0 => StationKind::Chamber,
                                1 => StationKind::Throat,
                                _ => StationKind::Exit,
                            },
                            state: state(&p, &product_names, fractions)?,
                            mach: finite(p[15])?,
                            performance,
                        });
                    }
                    Ok(Solution::Rocket { stations })
                }
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    unsafe fn equilibrium(
        &self,
        reactants: &Handle<'_>,
        products: &Handle<'_>,
        weights: &[f64],
        names: &[String],
        kind: i32,
        state1: f64,
        pressure_pa: f64,
    ) -> Result<Solution, String> {
        let api = &self.api;
        let mut solver = Handle::new(api, api.cea_eqsolver_destroy);
        api.check(
            (api.cea_eqsolver_create_with_reactants)(&mut solver.ptr, products.ptr, reactants.ptr),
            "create equilibrium solver",
        )?;
        let mut solution = Handle::new(api, api.cea_eqsolution_destroy);
        api.check(
            (api.cea_eqsolution_create)(&mut solution.ptr, solver.ptr),
            "create equilibrium solution",
        )?;
        api.check(
            (api.cea_eqsolver_solve)(
                solver.ptr,
                kind,
                state1,
                pressure_pa / 1e5,
                weights.as_ptr(),
                solution.ptr,
            ),
            "solve equilibrium",
        )?;
        let mut converged = 0;
        api.check(
            (api.cea_eqsolution_get_converged)(solution.ptr, &mut converged),
            "equilibrium convergence",
        )?;
        if converged != 1 {
            return Err("equilibrium calculation did not converge".into());
        }
        let mut properties = vec![0.0; 15];
        for (prop, value) in properties.iter_mut().enumerate() {
            api.check(
                (api.cea_eqsolution_get_property)(solution.ptr, prop as i32, value),
                "equilibrium property",
            )?;
        }
        let mut fractions = vec![0.0; names.len()];
        api.check(
            (api.cea_eqsolution_get_species_amounts)(
                solution.ptr,
                names.len() as i32,
                fractions.as_mut_ptr(),
                true,
            ),
            "equilibrium composition",
        )?;
        Ok(Solution::Equilibrium {
            state: state(&properties, names, fractions)?,
        })
    }
}

fn finite(value: f64) -> Result<f64, String> {
    if value.is_finite() && value.abs() < 1e100 {
        Ok(value)
    } else {
        Err("CEA returned a non-finite or undefined property".into())
    }
}

fn state(p: &[f64], names: &[String], fractions: Vec<f64>) -> Result<ThermodynamicState, String> {
    for i in [0, 1, 3, 5, 6, 8, 10, 13] {
        finite(p[i])?;
    }
    if p[0] <= 0.0 || p[1] <= 0.0 || p[3] <= 0.0 {
        return Err("CEA returned an invalid thermodynamic state".into());
    }
    let species = names
        .iter()
        .zip(fractions)
        .map(|(name, value)| {
            finite(value)?;
            if !(0.0..=1.00000001).contains(&value) {
                return Err("invalid species fraction".into());
            }
            Ok(SpeciesFraction {
                species: name.clone(),
                mass_fraction: value,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    if (species.iter().map(|s| s.mass_fraction).sum::<f64>() - 1.0).abs() > 1e-5 {
        return Err("CEA species mass fractions do not sum to 1".into());
    }
    Ok(ThermodynamicState {
        temperature_k: p[0],
        pressure_pa: p[1] * 1e5,
        density_kg_m3: p[3],
        molecular_weight_kg_kmol: p[5],
        enthalpy_j_kg: p[6] * 1000.0,
        entropy_j_kg_k: p[8] * 1000.0,
        gamma_s: p[10],
        cp_j_kg_k: p[13] * 1000.0,
        species,
    })
}
