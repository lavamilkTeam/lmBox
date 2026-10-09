//! Backend-only thermochemistry v1. Quantities use SI, mass fractions sum to one.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CeaRequest {
    pub schema_version: u32,
    pub project_id: String,
    pub job_id: String,
    pub input_revision: u64,
    pub reactants: Vec<Reactant>,
    pub calculation: Calculation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Reactant {
    pub species: String,
    pub mass_fraction: f64,
    pub temperature_k: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Calculation {
    Tp {
        temperature_k: f64,
        pressure_pa: f64,
    },
    /// Adiabatic equilibrium; enthalpy comes from the inlet reactants.
    Hp { pressure_pa: f64 },
    /// Infinite-area combustor; stations are chamber, throat, then exits.
    Rocket {
        chamber_pressure_pa: f64,
        exit_area_ratios: Vec<f64>,
        chemistry: RocketChemistry,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RocketChemistry {
    Equilibrium,
    FrozenAtChamber,
    FrozenAtThroat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CeaResult {
    pub schema_version: u32,
    pub project_id: String,
    pub job_id: String,
    pub input_revision: u64,
    pub engine_version: String,
    pub converged: bool,
    pub solution: Solution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum Solution {
    Equilibrium { state: ThermodynamicState },
    Rocket { stations: Vec<RocketStation> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThermodynamicState {
    pub temperature_k: f64,
    pub pressure_pa: f64,
    pub density_kg_m3: f64,
    pub enthalpy_j_kg: f64,
    pub entropy_j_kg_k: f64,
    pub cp_j_kg_k: f64,
    pub gamma_s: f64,
    pub molecular_weight_kg_kmol: f64,
    pub species: Vec<SpeciesFraction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpeciesFraction {
    pub species: String,
    pub mass_fraction: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RocketStation {
    pub kind: StationKind,
    pub state: ThermodynamicState,
    pub mach: f64,
    /// Undefined at the infinite-area chamber.
    pub performance: Option<RocketPerformance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StationKind {
    Chamber,
    Throat,
    Exit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RocketPerformance {
    pub area_ratio: f64,
    pub c_star_m_s: f64,
    /// Momentum-only Cf, equivalent to matched ambient and exit pressure.
    pub matched_thrust_coefficient: f64,
    pub matched_specific_impulse_s: f64,
    pub vacuum_specific_impulse_s: f64,
}
