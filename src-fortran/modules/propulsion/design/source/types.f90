module propulsion_types
  use, intrinsic :: iso_c_binding
  use, intrinsic :: ieee_arithmetic, only: ieee_is_finite
  implicit none
  private
  public :: nozzle_input, exit_conditions, nozzle_output, liquid_input, liquid_output
  public :: positive, pi, radians
  real(c_double), parameter :: pi = acos(-1.0_c_double), radians = pi / 180.0_c_double
  type, bind(c) :: nozzle_input
    real(c_double) :: chamber_pressure, mass_flow, ambient_pressure, expansion_ratio
    real(c_double) :: arc_ratio, start_angle, exit_angle, length_ratio
    integer(c_int) :: kind, segments
  end type
  type, bind(c) :: exit_conditions
    real(c_double) :: c_star, matched_cf, pressure
  end type
  type, bind(c) :: nozzle_output
    real(c_double) :: throat_area, exit_area, throat_radius, exit_radius, length
    real(c_double) :: thrust, isp, cf, divergence_factor
    integer(c_int) :: overexpanded
  end type
  type, bind(c) :: liquid_input
    real(c_double) :: density, viscosity, pressure_drop, discharge_coefficient, inner_diameter
    integer(c_int) :: element_count, kind
  end type
  type, bind(c) :: liquid_output
    real(c_double) :: mass_flow, flow_per_element, total_area, area_per_element
    real(c_double) :: inner_diameter, outer_diameter, hydraulic_diameter, velocity, reynolds
  end type
contains
  elemental logical function positive(x)
    real(c_double), intent(in) :: x
    positive = ieee_is_finite(x) .and. x > 0.0_c_double
  end function
end module
