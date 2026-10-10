module propulsion_nozzle
  use, intrinsic :: iso_c_binding
  use, intrinsic :: ieee_arithmetic, only: ieee_is_finite
  use propulsion_types
  implicit none
  private
  public :: validate_nozzle, calculate_nozzle
contains
  subroutine geometry(input, nx, ny, length, qx, qy, error)
    type(nozzle_input), intent(in) :: input
    real(c_double), intent(out) :: nx, ny, length, qx, qy
    character(*), intent(out) :: error
    real(c_double) :: theta, re, mn, me
    error = ''
    nx = 0; ny = 0; length = 0; qx = 0; qy = 0
    if (.not. all(positive([input%chamber_pressure, input%mass_flow, input%expansion_ratio, input%arc_ratio]))) then
      error = 'pressure, mass flow, expansion and arc ratios must be finite and positive'
      return
    end if
    if (.not. ieee_is_finite(input%ambient_pressure) .or. input%ambient_pressure < 0 &
        .or. input%ambient_pressure >= input%chamber_pressure .or. input%expansion_ratio <= 1) then
      error = 'ambient pressure must be >= 0 and < chamber pressure; expansion ratio must be > 1'
      return
    end if
    if (input%segments < 4 .or. input%segments > 2048) then
      error = 'segments must be 4..2048 per contour section'
      return
    end if
    if (.not. positive(input%start_angle) .or. input%start_angle >= 90) then
      error = 'start/half angle must be finite and between 0 and 90 degrees'
      return
    end if
    theta = input%start_angle * radians
    re = sqrt(input%expansion_ratio)
    nx = input%arc_ratio * sin(theta)
    ny = 1 + input%arc_ratio * (1 - cos(theta))
    if (.not. all(ieee_is_finite([nx, ny])) .or. ny >= re) then
      error = 'throat arc reaches or exceeds exit radius'
      return
    end if
    mn = tan(theta)
    select case (input%kind)
    case (0)
      length = nx + (re - ny) / mn
    case (1)
      if (.not. positive(input%length_ratio) .or. .not. ieee_is_finite(input%exit_angle) &
          .or. input%exit_angle < 0 .or. input%exit_angle >= input%start_angle) then
        error = 'bell length must be positive; exit angle must be >= 0 and < start angle'
        return
      end if
      length = input%length_ratio
      me = tan(input%exit_angle * radians)
      qx = (re - ny + mn * nx - me * length) / (mn - me)
      qy = ny + mn * (qx - nx)
      if (.not. all(ieee_is_finite([qx,qy])) .or. .not. (nx < qx .and. qx < length &
          .and. ny < qy .and. qy <= re)) then
        error = 'bell length and angles do not form a monotonic tangent quadratic'
        return
      end if
    case default
      error = 'unsupported nozzle contour kind'
      return
    end select
    if (.not. positive(length)) error = 'invalid divergent length'
  end subroutine

  subroutine validate_nozzle(input, error)
    type(nozzle_input), intent(in) :: input
    character(*), intent(out) :: error
    real(c_double) :: nx, ny, length, qx, qy
    call geometry(input, nx, ny, length, qx, qy, error)
  end subroutine

  subroutine calculate_nozzle(input, gas, output, x, radius, capacity, written, error)
    type(nozzle_input), intent(in) :: input
    type(exit_conditions), intent(in) :: gas
    type(nozzle_output), intent(out) :: output
    integer(c_int), intent(in) :: capacity
    real(c_double), intent(out) :: x(capacity), radius(capacity)
    integer(c_int), intent(out) :: written
    character(*), intent(out) :: error
    real(c_double) :: nx, ny, length, qx, qy, t, u, theta, rt, re
    integer :: i, n, j
    written = 0
    output = nozzle_output(0.0d0,0.0d0,0.0d0,0.0d0,0.0d0,0.0d0,0.0d0,0.0d0,-1.0d0,0)
    call geometry(input, nx, ny, length, qx, qy, error)
    if (len_trim(error) > 0) return
    n = input%segments
    if (capacity < 2*n+1) then
      error = 'contour buffer capacity is insufficient'
      return
    end if
    if (.not. all(positive([gas%c_star,gas%matched_cf,gas%pressure]))) then
      error = 'CEA exit conditions must be finite and positive'
      return
    end if
    output%throat_area = input%mass_flow * (gas%c_star / input%chamber_pressure)
    output%exit_area = output%throat_area * input%expansion_ratio
    rt = sqrt(output%throat_area / pi)
    re = sqrt(input%expansion_ratio)
    output%throat_radius = rt
    output%exit_radius = rt * re
    output%length = rt * length
    output%cf = gas%matched_cf + (gas%pressure-input%ambient_pressure) / input%chamber_pressure * input%expansion_ratio
    output%thrust = input%mass_flow * gas%c_star * output%cf
    output%isp = gas%c_star * output%cf / 9.80665_c_double
    if (.not. all(positive([output%throat_area,output%exit_area,rt,output%exit_radius,output%length, &
        output%cf,output%thrust,output%isp]))) then
      error = 'calculated nozzle quantity is nonpositive, underflowed or overflowed'
      return
    end if
    if (input%ambient_pressure > gas%pressure) output%overexpanded = 1
    theta = input%start_angle * radians
    if (input%kind == 0) output%divergence_factor = (1+cos(theta))/2
    do i=0,n
      t = theta * real(i,c_double) / n
      x(i+1) = rt * input%arc_ratio * sin(t)
      radius(i+1) = rt * (1+input%arc_ratio*(1-cos(t)))
    end do
    do i=1,n
      t = real(i,c_double)/n
      u = 1-t
      j = n+1+i
      if (input%kind == 0) then
        x(j) = rt*(u*nx+t*length)
        radius(j) = rt*(u*ny+t*re)
      else
        x(j) = rt*(u*u*nx+2*u*t*qx+t*t*length)
        radius(j) = rt*(u*u*ny+2*u*t*qy+t*t*re)
      end if
    end do
    if (.not. all(ieee_is_finite(x(:2*n+1))) .or. .not. all(positive(radius(:2*n+1)))) then
      error = 'nonfinite contour coordinates'
      return
    end if
    do i=2,2*n+1
      if (x(i) <= x(i-1) .or. radius(i) < radius(i-1)) then
        error = 'contour loses monotonicity or floating-point resolution'
        return
      end if
    end do
    written = 2*n+1
  end subroutine
end module
