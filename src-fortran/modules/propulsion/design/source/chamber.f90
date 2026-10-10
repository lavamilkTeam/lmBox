module propulsion_chamber
  use, intrinsic :: iso_c_binding
  use, intrinsic :: ieee_arithmetic, only: ieee_is_finite
  use propulsion_types
  implicit none
  private
  public :: calculate_chamber
contains
  subroutine calculate_chamber(input,rt,divergent,output,x,radius,capacity,written,error)
    type(chamber_input), intent(in) :: input
    real(c_double), intent(in) :: rt, divergent
    type(chamber_output), intent(out) :: output
    integer(c_int), intent(in) :: capacity
    real(c_double), intent(out) :: x(capacity),radius(capacity)
    integer(c_int), intent(out) :: written
    character(*), intent(out) :: error
    real(c_double) :: rc,drop,theta,a,b,length,straight,denom,t,u,angle,first_x,first_r,second_x,second_r
    integer :: n,count,i,j
    written=0; error=''
    output=chamber_output(0d0,0d0,0d0,0d0,0d0,0d0,0d0,0d0,0d0,0d0,0d0,0d0,0d0,0d0)
    if (.not. all(positive([rt,divergent,input%inner_diameter,input%cylinder_length]))) then
      error='chamber diameter, cylinder length and nozzle dimensions must be finite and positive'; return
    end if
    n=input%segments
    if (n<4 .or. n>2048) then
      error='chamber segments must be 4..2048'; return
    end if
    rc=input%inner_diameter/2; drop=rc-rt
    if (.not. positive(drop)) then
      error='chamber inner diameter must exceed the calculated throat diameter'; return
    end if
    a=0; b=0; angle=0; theta=0; straight=0
    select case(input%kind)
    case(0,1)
      if (.not. positive(input%angle) .or. input%angle>=90) then
        error='convergent angle must be finite and between 0 and 90 degrees'; return
      end if
      angle=input%angle; theta=angle*radians
      ! Stable 1-cos(theta) for small positive angles.
      denom=2*sin(theta/2)**2
      if (.not. positive(denom)) then
        error='convergent angle is below floating-point resolution'; return
      end if
      if (input%kind==0) then
        a=input%inlet_arc; b=input%throat_arc
        if (.not. all(positive([a,b]))) then
          error='inlet and upstream throat arc radii must be finite and positive'; return
        end if
        straight=(drop-(a+b)*denom)/tan(theta)
        if (.not. positive(straight)) then
          error='convergent fillets overlap; reduce radii or angle, or increase chamber diameter'; return
        end if
        count=2+3*n
      else
        if (.not. positive(input%throat_fraction) .or. input%throat_fraction>=1) then
          error='two-arc throat radius fraction must be between 0 and 1'; return
        end if
        a=(drop/denom)*(1-input%throat_fraction)
        b=(drop/denom)*input%throat_fraction
        count=2+2*n
      end if
      length=(a+b)*sin(theta)+straight
      first_x=-length+a*sin(theta); first_r=rc-a*denom
      second_x=-b*sin(theta); second_r=rt+b*denom
    case(2)
      length=input%curve_length
      if (.not. all(positive([length,input%start_handle,input%end_handle])) &
          .or. input%start_handle+input%end_handle>1) then
        error='Bezier length/handles must be positive and handle fractions must sum to <= 1'; return
      end if
      first_x=-length+input%start_handle*length; first_r=rc
      second_x=-input%end_handle*length; second_r=rt
      count=2+n
    case default
      error='unsupported convergent profile kind'; return
    end select
    if (.not. all(ieee_is_finite([a,b,length,first_x,first_r,second_x,second_r])) .or. .not. positive(length)) then
      error='convergent geometry overflow or underflow'; return
    end if
    if (capacity<count) then
      error='chamber contour buffer capacity is insufficient'; return
    end if
    output=chamber_output(-length-input%cylinder_length,-length,rc,(rc/rt)**2, &
      input%cylinder_length,length,input%cylinder_length+length+divergent,a,b,angle,first_x,first_r,second_x,second_r)
    if (.not. all(positive([output%contraction_ratio,output%total_length])) .or. &
        .not. ieee_is_finite(output%inlet_x)) then
      error='chamber dimensions overflow'; return
    end if
    x(1)=output%inlet_x; radius(1)=rc
    x(2)=-length; radius(2)=rc
    j=2
    if (input%kind==2) then
      do i=1,n
        t=real(i,c_double)/n; u=1-t; j=j+1
        x(j)=-length*u**3+3*u*u*t*first_x+3*u*t*t*second_x
        radius(j)=rc*(u**3+3*u*u*t)+rt*(3*u*t*t+t**3)
      end do
    else
      do i=1,n
        t=theta*real(i,c_double)/n; j=j+1
        x(j)=-length+a*sin(t); radius(j)=rc-2*a*sin(t/2)**2
      end do
      if (input%kind==0) then
        do i=1,n
          t=real(i,c_double)/n; j=j+1
          x(j)=(1-t)*first_x+t*second_x; radius(j)=(1-t)*first_r+t*second_r
        end do
      end if
      do i=1,n
        t=theta*(1-real(i,c_double)/n); j=j+1
        x(j)=-b*sin(t); radius(j)=rt+2*b*sin(t/2)**2
      end do
    end if
    ! Force the shared datum exactly; all intermediate points still require monotonicity.
    x(count)=0; radius(count)=rt
    if (.not. all(ieee_is_finite(x(:count))) .or. .not. all(positive(radius(:count)))) then
      error='nonfinite chamber coordinates'; return
    end if
    do i=2,count
      if (x(i)<=x(i-1) .or. radius(i)>radius(i-1)) then
        error='chamber contour loses monotonicity or floating-point resolution'; return
      end if
    end do
    written=count
  end subroutine
end module
