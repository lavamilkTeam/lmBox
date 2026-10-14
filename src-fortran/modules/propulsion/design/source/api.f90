module propulsion_api
  use, intrinsic :: iso_c_binding
  use propulsion_types
  use propulsion_nozzle
  use propulsion_injector
  use propulsion_chamber
  implicit none
  private
  public :: lmbox_chamber_calculate_v1
  public :: lmbox_propulsion_version, lmbox_nozzle_validate, lmbox_nozzle_calculate, lmbox_injector_calculate
contains
  integer(c_int) function lmbox_propulsion_version() bind(c)
    lmbox_propulsion_version = 1
  end function

  integer(c_int) function status(error, message)
    character(*), intent(in) :: error
    character(c_char), intent(out) :: message(256)
    integer :: i
    message = c_null_char
    do i=1,min(len_trim(error),255)
      message(i) = error(i:i)
    end do
    status = 0
    if (len_trim(error)>0) status = 1
  end function

  integer(c_int) function lmbox_nozzle_validate(input, message) bind(c)
    type(nozzle_input), intent(in) :: input
    character(c_char), intent(out) :: message(256)
    character(255) :: error
    call validate_nozzle(input,error)
    lmbox_nozzle_validate = status(error,message)
  end function

  integer(c_int) function lmbox_nozzle_calculate(input, gas, output, capacity, written, x, radius, message) bind(c)
    type(nozzle_input), intent(in) :: input
    type(exit_conditions), intent(in) :: gas
    type(nozzle_output), intent(out) :: output
    integer(c_int), value :: capacity
    integer(c_int), intent(out) :: written
    real(c_double), intent(out) :: x(*), radius(*)
    character(c_char), intent(out) :: message(256)
    character(255) :: error
    ! No allocation, saved mutable state, stdout or STOP across the ABI.
    call calculate_nozzle(input,gas,output,x(:max(0,capacity)),radius(:max(0,capacity)), &
                          max(0,capacity),written,error)
    lmbox_nozzle_calculate = status(error,message)
  end function

  integer(c_int) function lmbox_injector_calculate(flow, ratio, oxidizer, fuel, ox_output, fuel_output, message) bind(c)
    real(c_double), value :: flow, ratio
    type(liquid_input), intent(in) :: oxidizer, fuel
    type(liquid_output), intent(out) :: ox_output, fuel_output
    character(c_char), intent(out) :: message(256)
    character(255) :: error
    call calculate_injector(flow,ratio,oxidizer,fuel,ox_output,fuel_output,error)
    lmbox_injector_calculate = status(error,message)
  end function
  integer(c_int) function lmbox_chamber_calculate_v1(input, throat, divergent, output, &
      capacity, written, x, radius, message) bind(c)
    type(chamber_input), intent(in) :: input
    real(c_double), value :: throat, divergent
    type(chamber_output), intent(out) :: output
    integer(c_int), value :: capacity
    integer(c_int), intent(out) :: written
    real(c_double), intent(out) :: x(*), radius(*)
    character(c_char), intent(out) :: message(256)
    character(255) :: error
    call calculate_chamber(input,throat,divergent,output,x(:max(0,capacity)),radius(:max(0,capacity)), &
                           max(0,capacity),written,error)
    lmbox_chamber_calculate_v1 = status(error,message)
  end function
end module
