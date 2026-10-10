module fb_geometry
    use fb_parameters, only: wp
    use fb_math, only: cross2d
    implicit none

    interface quad_area
        ! Compute area of a 2D quadrilateral.
        module procedure :: quad_area_grid, &
                            quad_area_list
    end interface

    interface quad_volume
        ! Compute revolved volume (per radian) of a 2D quadrilateral.
        ! Assume y=0 is the axis of revolution: V = int(y * dA)
        module procedure :: quad_volume_grid, &
                            quad_volume_list
    end interface

contains

pure function unwind(xg) result(xl)
    real(wp), intent(in) :: xg(2,2)
    real(wp) :: xl(4)
    xl = [xg(1,1), xg(2,1), xg(2,2), xg(1,2)]
end function

pure function quad_area_grid(x,y) result(A)
    real(wp), intent(in) :: x(2,2)
    real(wp), intent(in) :: y(2,2)
    real(wp) :: A
    A = quad_area(unwind(x), unwind(y))
end function

pure function quad_area_list(x,y) result(A)
    real(wp), intent(in) :: x(4)
    real(wp), intent(in) :: y(4)
    real(wp) :: A
    A = (x(2)-x(1))*y(4) + (x(1)-x(4))*y(2)  &
      + (x(4)-x(2))*y(1) + (x(4)-x(3))*y(2)  &
      + (x(3)-x(2))*y(4) + (x(2)-x(4))*y(3)
    A = 0.5d0 * A
end function

pure function quad_volume_grid(x,y) result(V)
    real(wp), intent(in) :: x(2,2)
    real(wp), intent(in) :: y(2,2)
    real(wp) :: V
    V = quad_volume(unwind(x), unwind(y))
end function

pure function quad_volume_list(x,y) result(V)
    ! Evaluates int(y*dA) via bi-linear mapping to the unit square

    ! Arguments
    real(wp), intent(in) :: x(4)
    real(wp), intent(in) :: y(4)
    real(wp) :: V

    ! Local variables
    real(wp) :: e1(2), e2(2)  ! Vectors representing cell edges
    real(wp) :: A(4)          ! Jacobian of the local-to-global coordinate
                              ! transform at each cell corner (~cell area)

    ! Mass matrix of pre-computed shape function integrals, times 36.0
    real(wp), parameter :: M(4,4) = reshape([ &
        4.0d0, 2.0d0, 1.0d0, 2.0d0, &
        2.0d0, 4.0d0, 2.0d0, 1.0d0, &
        1.0d0, 2.0d0, 4.0d0, 2.0d0, &
        2.0d0, 1.0d0, 2.0d0, 4.0d0  &
    ], shape(M))

    e1 = [ x(2)-x(1), y(2)-y(1) ]
    e2 = [ x(4)-x(1), y(4)-y(1) ]
    A(1) = cross2d(e1,e2)

    e1 = [ x(3)-x(2), y(3)-y(2) ]
    e2 = [ x(1)-x(2), y(1)-y(2) ]
    A(2) = cross2d(e1,e2)

    e1 = [ x(4)-x(3), y(4)-y(3) ]
    e2 = [ x(2)-x(3), y(2)-y(3) ]
    A(3) = cross2d(e1,e2)

    e1 = [ x(1)-x(4), y(1)-y(4) ]
    e2 = [ x(3)-x(4), y(3)-y(4) ]
    A(4) = cross2d(e1,e2)

    V = dot_product(y, matmul(M, A)) / 36.0d0

    return
end function

end module
