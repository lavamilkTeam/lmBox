#ifndef LMBOX_PROPULSION_H
#define LMBOX_PROPULSION_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* ABI v1. SI quantities; angles in degrees. Callers own all buffers.
 * Non-null pointers required. Every message buffer has 256 bytes.
 * Status 0: success. Status 1: failure; discard all numerical output.
 * No allocation crosses the ABI. Functions are reentrant and never print/STOP. */
typedef struct {
  double chamber_pressure, mass_flow, ambient_pressure, expansion_ratio;
  double arc_ratio, start_angle, exit_angle, length_ratio;
  int32_t kind, segments; /* kind: 0 conical, 1 prescribed-angle quadratic bell */
} lmbox_nozzle_input;
typedef struct { double c_star, matched_cf, pressure; } lmbox_exit_conditions;
typedef struct {
  double throat_area, exit_area, throat_radius, exit_radius, length;
  double thrust, isp, cf, divergence_factor; /* factor -1 for bell */
  int32_t overexpanded;
} lmbox_nozzle_output;
typedef struct {
  double density, viscosity, pressure_drop, discharge_coefficient, inner_diameter;
  int32_t element_count, kind; /* kind: 0 circular, 1 annular */
} lmbox_liquid_input;
typedef struct {
  double mass_flow, flow_per_element, total_area, area_per_element;
  double inner_diameter, outer_diameter, hydraulic_diameter, velocity, reynolds;
} lmbox_liquid_output;
/* Additive chamber geometry API; existing ABI v1 structs/symbols are unchanged. */
typedef struct {
  double inner_diameter, cylinder_length, angle, inlet_arc, throat_arc;
  double throat_fraction, curve_length, start_handle, end_handle;
  int32_t kind, segments; /* 0 filleted cone, 1 tangent two-arc, 2 cubic Bezier */
} lmbox_chamber_input;
typedef struct {
  double inlet_x, convergent_start_x, inner_radius, contraction_ratio;
  double cylinder_length, convergent_length, total_length, inlet_arc, throat_arc, angle;
  double first_x, first_r, second_x, second_r;
} lmbox_chamber_output;
/* Upstream profile: two cylinder endpoints plus at most 3*segments points.
 * x=0 at throat, upstream x<0. capacity must be >= 2+3*segments for kind 0,
 * >= 2+2*segments for kind 1, >= 2+segments for kind 2. Maximum 6146.
 * first/second are tangent junctions (arcs) or Bezier control points (kind 2).
 * For kind 2 circular radii and angle are zero (not circular arcs).
 * Caller must discard ALL numerical output on nonzero status. */
int32_t lmbox_chamber_calculate_v1(const lmbox_chamber_input*, double throat, double divergent,
  lmbox_chamber_output*, int32_t capacity, int32_t* written, double* x, double* radius, char message[256]);
int32_t lmbox_propulsion_version(void);
int32_t lmbox_nozzle_validate(const lmbox_nozzle_input*, char message[256]);
/* x and radius each have at least capacity elements; success writes 2*segments+1. */
int32_t lmbox_nozzle_calculate(const lmbox_nozzle_input*, const lmbox_exit_conditions*,
  lmbox_nozzle_output*, int32_t capacity, int32_t* written, double* x, double* radius, char message[256]);
int32_t lmbox_injector_calculate(double flow, double ratio, const lmbox_liquid_input*,
  const lmbox_liquid_input*, lmbox_liquid_output*, lmbox_liquid_output*, char message[256]);
#ifdef __cplusplus
}
#endif
#endif
