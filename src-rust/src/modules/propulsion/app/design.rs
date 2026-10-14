use super::super::runtime::design as propulsion;
use super::{CeaBackend, CeaError};
use crate::contracts::{
    propulsion::*,
    thermochemistry::{Calculation, CeaRequest, Solution, StationKind},
};

#[derive(Debug, thiserror::Error)]
pub enum DesignError {
    #[error("invalid design request: {0}")]
    InvalidRequest(String),
    #[error(transparent)]
    Cea(#[from] CeaError),
    #[error("Fortran propulsion: {0}")]
    Calculation(String),
}

/// Trusted native runtime; numerical models and numeric validation are Fortran-owned.
pub struct PropulsionBackend {
    engine: propulsion::Engine,
}

impl PropulsionBackend {
    pub fn load(runtime_dir: impl AsRef<std::path::Path>) -> Result<Self, DesignError> {
        let root = runtime_dir
            .as_ref()
            .canonicalize()
            .map_err(|e| DesignError::Calculation(e.to_string()))?;
        let engine = propulsion::Engine::load(&root).map_err(DesignError::Calculation)?;
        Ok(Self { engine })
    }

    /// Synchronous preliminary sizing using a fresh Fortran CEA calculation.
    /// The requested contour does not alter the one-dimensional ideal performance.
    pub fn design_nozzle(
        &self,
        cea_backend: &CeaBackend,
        request: &NozzleRequest,
    ) -> Result<NozzleResult, DesignError> {
        identity(&request.identity)?;
        self.engine
            .validate_nozzle(request)
            .map_err(DesignError::InvalidRequest)?;
        let cea = cea_backend.solve(&CeaRequest {
            schema_version: request.identity.schema_version,
            project_id: request.identity.project_id.clone(),
            job_id: request.identity.job_id.clone(),
            input_revision: request.identity.input_revision,
            reactants: request.reactants.clone(),
            calculation: Calculation::Rocket {
                chamber_pressure_pa: request.chamber_pressure_pa,
                exit_area_ratios: vec![request.expansion_ratio],
                chemistry: request.chemistry,
            },
        })?;
        let Solution::Rocket { stations } = &cea.solution else {
            return Err(DesignError::Calculation(
                "expected CEA rocket solution".into(),
            ));
        };
        let exit = stations
            .iter()
            .find(|station| matches!(station.kind, StationKind::Exit))
            .ok_or_else(|| DesignError::Calculation("missing CEA exit station".into()))?;
        let performance = exit
            .performance
            .as_ref()
            .ok_or_else(|| DesignError::Calculation("missing CEA exit performance".into()))?;
        let (calculated, points) = self
            .engine
            .nozzle(
                request,
                propulsion::ExitConditions {
                    c_star: performance.c_star_m_s,
                    matched_cf: performance.matched_thrust_coefficient,
                    pressure: exit.state.pressure_pa,
                },
            )
            .map_err(DesignError::Calculation)?;
        let chamber_geometry = request
            .chamber
            .as_ref()
            .map(|chamber| {
                self.engine
                    .chamber(
                        chamber,
                        calculated.throat_radius,
                        calculated.length,
                        request.segments,
                    )
                    .map_err(DesignError::InvalidRequest)
            })
            .transpose()?;
        let mut warnings = Vec::new();
        if calculated.overexpanded != 0 {
            warnings.push("overexpanded: ideal attached-flow thrust only; separation and side loads are not modeled".into());
        }
        Ok(NozzleResult {
            identity: request.identity.clone(), model_version: "nozzle-preliminary/1".into(), cea,
            throat_area_m2: calculated.throat_area, exit_area_m2: calculated.exit_area,
            throat_radius_m: calculated.throat_radius, exit_radius_m: calculated.exit_radius,
            divergent_length_m: calculated.length, mass_flow_kg_s: request.mass_flow_kg_s,
            ideal_thrust_n: calculated.thrust, ideal_specific_impulse_s: calculated.isp,
            ideal_thrust_coefficient: calculated.cf, conical_divergence_factor: (calculated.divergence_factor >= 0.0).then_some(calculated.divergence_factor),
            contour: points, chamber_geometry,
            assumptions: vec![
                "ideal steady one-dimensional CEA IAC performance; throat discharge coefficient equals one".into(),
                "inner flow contour only; wall thickness, cooling, connections and stress design are not defined".into(),
                "quadratic bell is a prescribed-angle geometric approximation, not a maximum-thrust/Rao/MOC solution".into(),
                "optional chamber geometry does not change the infinite-area ideal CEA performance model".into(),
                "contour losses are not applied to ideal thrust; cone divergence factor is informational only".into(),
            ], warnings,
        })
    }

    /// Independent incompressible liquid-passage sizing; no thermochemistry runtime required.
    pub fn design_injector(
        &self,
        request: &InjectorRequest,
    ) -> Result<InjectorResult, DesignError> {
        identity(&request.identity)?;
        let (oxidizer, fuel) = self
            .engine
            .injector(
                request.total_mass_flow_kg_s,
                request.oxidizer_fuel_mass_ratio,
                &request.oxidizer,
                &request.fuel,
            )
            .map_err(DesignError::InvalidRequest)?;
        Ok(InjectorResult {
        identity: request.identity.clone(), model_version: "injector-hydraulics/1".into(),oxidizer,fuel,
        assumptions: vec![
            "steady incompressible single-phase non-cavitating liquid with supplied density and viscosity".into(),
            "equal flow through identical elements; supplied discharge coefficient applies at this operating point".into(),
            "independent circular or annular passage sizing; no coaxial assembly clearance or wall-thickness validation".into(),
            "no swirl, atomization, mixing, spray angle, face layout, thermal or combustion-stability model".into(),
        ],
    })
    }
}

fn identity(value: &DesignIdentity) -> Result<(), DesignError> {
    if value.schema_version != 1 {
        return Err(DesignError::InvalidRequest(
            "unsupported design schemaVersion".into(),
        ));
    }
    for id in [&value.project_id, &value.job_id] {
        if id.trim().is_empty() || id.len() > 128 || id.chars().any(char::is_control) {
            return Err(DesignError::InvalidRequest(
                "projectId/jobId must contain 1..128 bytes without controls".into(),
            ));
        }
    }
    Ok(())
}
