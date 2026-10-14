module propulsion_injector
  use, intrinsic :: iso_c_binding
  use propulsion_types
  implicit none
  private
  public :: calculate_injector
contains
  subroutine circuit(flow, input, output, error)
    real(c_double), intent(in) :: flow
    type(liquid_input), intent(in) :: input
    type(liquid_output), intent(out) :: output
    character(*), intent(out) :: error
    real(c_double) :: inner, outer, hydraulic, velocity, area, total_area, re
    error = ''
    output = liquid_output(0.0d0,0.0d0,0.0d0,0.0d0,0.0d0,0.0d0,0.0d0,0.0d0,0.0d0)
    if (.not. all(positive([flow,input%density,input%viscosity,input%pressure_drop,input%discharge_coefficient]))) then
      error = 'liquid flow, density, viscosity, pressure drop and Cd must be finite and positive'
      return
    end if
    if (input%discharge_coefficient > 1 .or. input%element_count < 1 .or. input%element_count > 100000) then
      error = 'Cd must be <= 1 and element count must be 1..100000'
      return
    end if
    inner = 0
    select case (input%kind)
    case (0)
    case (1)
      inner = input%inner_diameter
      if (.not. positive(inner)) then
        error = 'annular inner diameter must be finite and positive'
        return
      end if
    case default
      error = 'unsupported liquid passage kind'
      return
    end select
    velocity = input%discharge_coefficient * sqrt(2*(input%pressure_drop/input%density))
    total_area = flow / (input%density*velocity)
    area = total_area / input%element_count
    outer = hypot(inner,sqrt(4*area/pi))
    ! Rationalize the annular difference to retain precision for thin gaps.
    hydraulic = outer
    if (inner > 0) hydraulic = (4*area/pi)/(outer+inner)
    re = input%density*velocity*hydraulic/input%viscosity
    if (.not. all(positive([velocity,total_area,area,outer,hydraulic,re,flow/input%element_count]))) then
      error = 'calculated hydraulic quantity is nonpositive, underflowed or overflowed'
      return
    end if
    if (outer <= inner) then
      error = 'annular gap is below floating-point resolution'
      return
    end if
    output = liquid_output(flow,flow/input%element_count,total_area,area,inner,outer,hydraulic,velocity,re)
  end subroutine

  subroutine calculate_injector(flow, ratio, oxidizer, fuel, ox_output, fuel_output, error)
    real(c_double), intent(in) :: flow, ratio
    type(liquid_input), intent(in) :: oxidizer, fuel
    type(liquid_output), intent(out) :: ox_output, fuel_output
    character(*), intent(out) :: error
    error = ''
    ox_output = liquid_output(0.0d0,0.0d0,0.0d0,0.0d0,0.0d0,0.0d0,0.0d0,0.0d0,0.0d0)
    fuel_output = ox_output
    if (.not. all(positive([flow,ratio]))) then
      error = 'total mass flow and O/F mass ratio must be finite and positive'
      return
    end if
    call circuit(flow*(ratio/(1+ratio)),oxidizer,ox_output,error)
    if (len_trim(error)>0) return
    call circuit(flow/(1+ratio),fuel,fuel_output,error)
  end subroutine
end module
