use crate::contracts::propulsion::{
    ChamberGeometry, ChamberRequest, ContourPoint, ConvergentProfile, LiquidCircuit,
    LiquidCircuitResult, LiquidPassage, NozzleContour, NozzleRequest,
};
use libloading::Library;
use std::{ffi::c_char, path::Path};

#[cfg(target_os = "macos")]
const LIBRARY: &str = "liblmbox_propulsion.dylib";
#[cfg(target_os = "linux")]
const LIBRARY: &str = "liblmbox_propulsion.so";
#[cfg(target_os = "windows")]
const LIBRARY: &str = "liblmbox_propulsion.dll";

// repr(C) declarations mirror src-fortran/modules/propulsion/design/include/propulsion.h.
#[repr(C)]
struct NozzleInput {
    chamber_pressure: f64,
    mass_flow: f64,
    ambient_pressure: f64,
    expansion_ratio: f64,
    arc_ratio: f64,
    start_angle: f64,
    exit_angle: f64,
    length_ratio: f64,
    kind: i32,
    segments: i32,
}
#[repr(C)]
pub(crate) struct ExitConditions {
    pub c_star: f64,
    pub matched_cf: f64,
    pub pressure: f64,
}
#[repr(C)]
#[derive(Default)]
pub(crate) struct NozzleOutput {
    pub throat_area: f64,
    pub exit_area: f64,
    pub throat_radius: f64,
    pub exit_radius: f64,
    pub length: f64,
    pub thrust: f64,
    pub isp: f64,
    pub cf: f64,
    pub divergence_factor: f64,
    pub overexpanded: i32,
}
#[repr(C)]
struct LiquidInput {
    density: f64,
    viscosity: f64,
    pressure_drop: f64,
    discharge_coefficient: f64,
    inner_diameter: f64,
    element_count: i32,
    kind: i32,
}
#[repr(C)]
#[derive(Default)]
struct LiquidOutput {
    mass_flow: f64,
    flow_per_element: f64,
    total_area: f64,
    area_per_element: f64,
    inner_diameter: f64,
    outer_diameter: f64,
    hydraulic_diameter: f64,
    velocity: f64,
    reynolds: f64,
}

#[repr(C)]
struct ChamberInput {
    inner_diameter: f64,
    cylinder_length: f64,
    angle: f64,
    inlet_arc: f64,
    throat_arc: f64,
    throat_fraction: f64,
    curve_length: f64,
    start_handle: f64,
    end_handle: f64,
    kind: i32,
    segments: i32,
}
#[repr(C)]
#[derive(Default)]
struct ChamberOutput {
    inlet_x: f64,
    convergent_start_x: f64,
    inner_radius: f64,
    contraction_ratio: f64,
    cylinder_length: f64,
    convergent_length: f64,
    total_length: f64,
    inlet_arc: f64,
    throat_arc: f64,
    angle: f64,
    first_x: f64,
    first_r: f64,
    second_x: f64,
    second_r: f64,
}
type Chamber = unsafe extern "C" fn(
    *const ChamberInput,
    f64,
    f64,
    *mut ChamberOutput,
    i32,
    *mut i32,
    *mut f64,
    *mut f64,
    *mut c_char,
) -> i32;

type Validate = unsafe extern "C" fn(*const NozzleInput, *mut c_char) -> i32;
type Nozzle = unsafe extern "C" fn(
    *const NozzleInput,
    *const ExitConditions,
    *mut NozzleOutput,
    i32,
    *mut i32,
    *mut f64,
    *mut f64,
    *mut c_char,
) -> i32;
type Injector = unsafe extern "C" fn(
    f64,
    f64,
    *const LiquidInput,
    *const LiquidInput,
    *mut LiquidOutput,
    *mut LiquidOutput,
    *mut c_char,
) -> i32;

pub(crate) struct Engine {
    validate: Validate,
    nozzle: Nozzle,
    injector: Injector,
    chamber: Option<Chamber>,
    _library: Library,
}
impl Engine {
    pub(crate) fn load(root: &Path) -> Result<Self, String> {
        // SAFETY: only load a trusted host path. Version and symbols are checked;
        // function pointers cannot outlive the owning Library in Engine.
        unsafe {
            let library = Library::new(root.join(LIBRARY)).map_err(|e| e.to_string())?;
            let version = library
                .get::<unsafe extern "C" fn() -> i32>(b"lmbox_propulsion_version\0")
                .map_err(|e| e.to_string())?;
            if version() != 1 {
                return Err("expected propulsion ABI version 1".into());
            }
            let validate = *library
                .get::<Validate>(b"lmbox_nozzle_validate\0")
                .map_err(|e| e.to_string())?;
            let nozzle = *library
                .get::<Nozzle>(b"lmbox_nozzle_calculate\0")
                .map_err(|e| e.to_string())?;
            let injector = *library
                .get::<Injector>(b"lmbox_injector_calculate\0")
                .map_err(|e| e.to_string())?;
            let chamber = library
                .get::<Chamber>(b"lmbox_chamber_calculate_v1\0")
                .ok()
                .map(|symbol| *symbol);
            Ok(Self {
                validate,
                nozzle,
                injector,
                chamber,
                _library: library,
            })
        }
    }
    pub(crate) fn validate_nozzle(&self, request: &NozzleRequest) -> Result<(), String> {
        let input = nozzle_input(request)?;
        let mut message = [0; 256];
        // SAFETY: matching repr(C) input and writable 256-byte message live across call.
        let status = unsafe { (self.validate)(&input, message.as_mut_ptr()) };
        check(status, &message)
    }
    pub(crate) fn nozzle(
        &self,
        request: &NozzleRequest,
        gas: ExitConditions,
    ) -> Result<(NozzleOutput, Vec<ContourPoint>), String> {
        let input = nozzle_input(request)?;
        let mut output = NozzleOutput::default();
        let mut x = vec![0.0; 4097];
        let mut radius = vec![0.0; 4097];
        let mut written = 0;
        let mut message = [0; 256];
        // SAFETY: fixed maximum-size caller-owned arrays, correct scalar ABI and
        // all pointers remain valid. Fortran checks input/count before array writes.
        let status = unsafe {
            (self.nozzle)(
                &input,
                &gas,
                &mut output,
                4097,
                &mut written,
                x.as_mut_ptr(),
                radius.as_mut_ptr(),
                message.as_mut_ptr(),
            )
        };
        check(status, &message)?;
        if !(9..=4097).contains(&written) {
            return Err("Fortran returned an invalid contour count".into());
        }
        let points = x
            .into_iter()
            .zip(radius)
            .take(written as usize)
            .map(|(x_m, radius_m)| ContourPoint { x_m, radius_m })
            .collect();
        Ok((output, points))
    }
    pub(crate) fn chamber(
        &self,
        request: &ChamberRequest,
        throat: f64,
        divergent: f64,
        segments: u32,
    ) -> Result<ChamberGeometry, String> {
        let call = self
            .chamber
            .ok_or("chamber geometry API is unavailable; rebuild the propulsion runtime")?;
        let mut input = ChamberInput {
            inner_diameter: request.inner_diameter_m,
            cylinder_length: request.cylinder_length_m,
            angle: 0.0,
            inlet_arc: 0.0,
            throat_arc: 0.0,
            throat_fraction: 0.0,
            curve_length: 0.0,
            start_handle: 0.0,
            end_handle: 0.0,
            kind: 0,
            segments: segments
                .try_into()
                .map_err(|_| "segment count exceeds ABI integer range")?,
        };
        match request.convergence {
            ConvergentProfile::FilletedCone {
                half_angle_deg,
                inlet_radius_m,
                throat_radius_m,
            } => {
                input.angle = half_angle_deg;
                input.inlet_arc = inlet_radius_m;
                input.throat_arc = throat_radius_m;
            }
            ConvergentProfile::TangentArcs {
                join_angle_deg,
                throat_radius_fraction,
            } => {
                input.kind = 1;
                input.angle = join_angle_deg;
                input.throat_fraction = throat_radius_fraction;
            }
            ConvergentProfile::CubicBezier {
                length_m,
                start_handle_fraction,
                end_handle_fraction,
            } => {
                input.kind = 2;
                input.curve_length = length_m;
                input.start_handle = start_handle_fraction;
                input.end_handle = end_handle_fraction;
            }
        }
        let mut output = ChamberOutput::default();
        let mut x = vec![0.0; 6146];
        let mut radius = vec![0.0; 6146];
        let mut written = 0;
        let mut message = [0; 256];
        // SAFETY: additive ABI v1 symbol with matching repr(C) records and caller-owned bounded arrays.
        let status = unsafe {
            call(
                &input,
                throat,
                divergent,
                &mut output,
                6146,
                &mut written,
                x.as_mut_ptr(),
                radius.as_mut_ptr(),
                message.as_mut_ptr(),
            )
        };
        check(status, &message)?;
        if !(6..=6146).contains(&written) {
            return Err("Fortran returned an invalid chamber count".into());
        }
        Ok(ChamberGeometry {
            inlet_x_m: output.inlet_x,
            convergent_start_x_m: output.convergent_start_x,
            inner_radius_m: output.inner_radius,
            contraction_ratio: output.contraction_ratio,
            cylinder_length_m: output.cylinder_length,
            convergent_length_m: output.convergent_length,
            total_length_m: output.total_length,
            inlet_arc_radius_m: output.inlet_arc,
            throat_arc_radius_m: output.throat_arc,
            join_angle_deg: output.angle,
            first_point: ContourPoint {
                x_m: output.first_x,
                radius_m: output.first_r,
            },
            second_point: ContourPoint {
                x_m: output.second_x,
                radius_m: output.second_r,
            },
            contour: x
                .into_iter()
                .zip(radius)
                .take(written as usize)
                .map(|(x_m, radius_m)| ContourPoint { x_m, radius_m })
                .collect(),
        })
    }
    pub(crate) fn injector(
        &self,
        flow: f64,
        ratio: f64,
        oxidizer: &LiquidCircuit,
        fuel: &LiquidCircuit,
    ) -> Result<(LiquidCircuitResult, LiquidCircuitResult), String> {
        let ox = liquid_input(oxidizer)?;
        let fuel = liquid_input(fuel)?;
        let mut ox_output = LiquidOutput::default();
        let mut fuel_output = LiquidOutput::default();
        let mut message = [0; 256];
        // SAFETY: input/output repr(C) layouts match the header and Fortran bind(C).
        // No pointer is retained by the reentrant, allocation-free native function.
        let status = unsafe {
            (self.injector)(
                flow,
                ratio,
                &ox,
                &fuel,
                &mut ox_output,
                &mut fuel_output,
                message.as_mut_ptr(),
            )
        };
        check(status, &message)?;
        Ok((liquid_result(ox_output), liquid_result(fuel_output)))
    }
}
fn check(status: i32, message: &[c_char; 256]) -> Result<(), String> {
    if status == 0 {
        return Ok(());
    }
    let bytes: Vec<u8> = message
        .iter()
        .take_while(|&&b| b != 0)
        .map(|&b| b as u8)
        .collect();
    Err(format!(
        "Fortran status {status}: {}",
        String::from_utf8_lossy(&bytes)
    ))
}
fn nozzle_input(r: &NozzleRequest) -> Result<NozzleInput, String> {
    let (kind, arc, start, exit, length) = match r.contour {
        NozzleContour::Conical {
            half_angle_deg,
            throat_arc_radius_ratio,
        } => (0, throat_arc_radius_ratio, half_angle_deg, 0.0, 0.0),
        NozzleContour::QuadraticBell {
            start_angle_deg,
            exit_angle_deg,
            throat_arc_radius_ratio,
            length_over_throat_radius,
        } => (
            1,
            throat_arc_radius_ratio,
            start_angle_deg,
            exit_angle_deg,
            length_over_throat_radius,
        ),
    };
    Ok(NozzleInput {
        chamber_pressure: r.chamber_pressure_pa,
        mass_flow: r.mass_flow_kg_s,
        ambient_pressure: r.ambient_pressure_pa,
        expansion_ratio: r.expansion_ratio,
        arc_ratio: arc,
        start_angle: start,
        exit_angle: exit,
        length_ratio: length,
        kind,
        segments: r
            .segments
            .try_into()
            .map_err(|_| "segment count exceeds ABI integer range")?,
    })
}
fn liquid_input(r: &LiquidCircuit) -> Result<LiquidInput, String> {
    let (kind, inner_diameter) = match r.passage {
        LiquidPassage::Circular => (0, 0.0),
        LiquidPassage::Annular { inner_diameter_m } => (1, inner_diameter_m),
    };
    Ok(LiquidInput {
        density: r.density_kg_m3,
        viscosity: r.dynamic_viscosity_pa_s,
        pressure_drop: r.pressure_drop_pa,
        discharge_coefficient: r.discharge_coefficient,
        inner_diameter,
        kind,
        element_count: r
            .element_count
            .try_into()
            .map_err(|_| "element count exceeds ABI integer range")?,
    })
}
fn liquid_result(r: LiquidOutput) -> LiquidCircuitResult {
    LiquidCircuitResult {
        mass_flow_kg_s: r.mass_flow,
        mass_flow_per_element_kg_s: r.flow_per_element,
        total_flow_area_m2: r.total_area,
        area_per_element_m2: r.area_per_element,
        inner_diameter_m: r.inner_diameter,
        outer_diameter_m: r.outer_diameter,
        hydraulic_diameter_m: r.hydraulic_diameter,
        mean_velocity_m_s: r.velocity,
        reynolds_number: r.reynolds,
    }
}
