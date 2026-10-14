//! Preliminary design v1. SI quantities; angles explicitly use degrees.
use super::thermochemistry::{CeaResult, Reactant, RocketChemistry};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DesignIdentity {
    pub schema_version: u32,
    pub project_id: String,
    pub job_id: String,
    pub input_revision: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NozzleRequest {
    pub identity: DesignIdentity,
    pub reactants: Vec<Reactant>,
    pub chemistry: RocketChemistry,
    pub chamber_pressure_pa: f64,
    pub mass_flow_kg_s: f64,
    pub ambient_pressure_pa: f64,
    pub expansion_ratio: f64,
    /// Number of intervals in EACH contour segment.
    pub segments: u32,
    pub contour: NozzleContour,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chamber: Option<ChamberRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum NozzleContour {
    Conical {
        half_angle_deg: f64,
        throat_arc_radius_ratio: f64,
    },
    /// Circular throat arc + tangent quadratic Bezier. Not a Rao optimizer.
    QuadraticBell {
        length_over_throat_radius: f64,
        start_angle_deg: f64,
        exit_angle_deg: f64,
        throat_arc_radius_ratio: f64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChamberRequest {
    pub inner_diameter_m: f64,
    pub cylinder_length_m: f64,
    pub convergence: ConvergentProfile,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ConvergentProfile {
    FilletedCone {
        half_angle_deg: f64,
        inlet_radius_m: f64,
        throat_radius_m: f64,
    },
    TangentArcs {
        join_angle_deg: f64,
        throat_radius_fraction: f64,
    },
    CubicBezier {
        length_m: f64,
        start_handle_fraction: f64,
        end_handle_fraction: f64,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChamberGeometry {
    pub inlet_x_m: f64,
    pub convergent_start_x_m: f64,
    pub inner_radius_m: f64,
    pub contraction_ratio: f64,
    pub cylinder_length_m: f64,
    pub convergent_length_m: f64,
    pub total_length_m: f64,
    pub inlet_arc_radius_m: f64,
    pub throat_arc_radius_m: f64,
    pub join_angle_deg: f64,
    pub first_point: ContourPoint,
    pub second_point: ContourPoint,
    pub contour: Vec<ContourPoint>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContourPoint {
    pub x_m: f64,
    pub radius_m: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NozzleResult {
    pub identity: DesignIdentity,
    pub model_version: String,
    pub cea: CeaResult,
    pub throat_area_m2: f64,
    pub exit_area_m2: f64,
    pub throat_radius_m: f64,
    pub exit_radius_m: f64,
    pub divergent_length_m: f64,
    pub mass_flow_kg_s: f64,
    pub ideal_thrust_n: f64,
    pub ideal_specific_impulse_s: f64,
    pub ideal_thrust_coefficient: f64,
    /// Informational cone estimate; never applied to ideal CEA performance.
    pub conical_divergence_factor: Option<f64>,
    pub contour: Vec<ContourPoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chamber_geometry: Option<ChamberGeometry>,
    pub assumptions: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InjectorRequest {
    pub identity: DesignIdentity,
    pub total_mass_flow_kg_s: f64,
    pub oxidizer_fuel_mass_ratio: f64,
    pub oxidizer: LiquidCircuit,
    pub fuel: LiquidCircuit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LiquidCircuit {
    pub density_kg_m3: f64,
    pub dynamic_viscosity_pa_s: f64,
    pub pressure_drop_pa: f64,
    /// Measured/supplied coefficient for this geometry and operating point.
    pub discharge_coefficient: f64,
    pub element_count: u32,
    pub passage: LiquidPassage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum LiquidPassage {
    Circular,
    Annular { inner_diameter_m: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InjectorResult {
    pub identity: DesignIdentity,
    pub model_version: String,
    pub oxidizer: LiquidCircuitResult,
    pub fuel: LiquidCircuitResult,
    pub assumptions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LiquidCircuitResult {
    pub mass_flow_kg_s: f64,
    pub mass_flow_per_element_kg_s: f64,
    pub total_flow_area_m2: f64,
    pub area_per_element_m2: f64,
    pub inner_diameter_m: f64,
    pub outer_diameter_m: f64,
    pub hydraulic_diameter_m: f64,
    pub mean_velocity_m_s: f64,
    pub reynolds_number: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    content = "request",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum DesignRequest {
    Nozzle(NozzleRequest),
    Injector(InjectorRequest),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    content = "result",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum DesignResult {
    Nozzle(Box<NozzleResult>),
    Injector(Box<InjectorResult>),
}
