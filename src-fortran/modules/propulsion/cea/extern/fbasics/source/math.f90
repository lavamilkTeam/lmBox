module fb_math

    use fb_parameters, only: wp
    implicit none

    interface orthogonal_vectors
        module procedure :: orthogonal_vectors_2d, &
                            orthogonal_vectors_3d
    end interface

contains

    pure function cross2d(x,y) result(z)
        ! Compute the cross product of two vectors in 2D
        real(wp), intent(in) :: x(2), y(2)
        real(wp) :: z
        z = x(1)*y(2) - x(2)*y(1)
    end function

    pure function cross(x,y) result(z)
        ! Compute the cross product of two vectors in 3D
        real(wp), intent(in) :: x(3),y(3)
        real(wp) :: z(3)
        z(1) = x(2)*y(3) - x(3)*y(2)
        z(2) = x(3)*y(1) - x(1)*y(3)
        z(3) = x(1)*y(2) - x(2)*y(1)
    end function

    pure function norm(x) result(l2)
        ! Compute L2 norm of a vector
        real(wp), intent(in) :: x(:)
        real(wp) :: l2
        l2 = sqrt(sum(x*x))
    end function

    pure subroutine orthogonal_vectors_2d(ndir,tdir)
        ! Get vector orthogonal to input unit vector
        ! In 2D, simply reverse and negate components
        real(wp), intent(in)  :: ndir(2)  ! Normal vector
        real(wp), intent(out) :: tdir(2)  ! Tangent vector
        tdir = [ -ndir(2), ndir(1) ]
    end subroutine

    pure subroutine orthogonal_vectors_3d(ndir,tdirs)
        ! Get vectors orthogonal to input unit vector
        ! See Duff(2017), J. of Comp. Graphics Techniques, Vol. 6, No. 1
        real(wp), intent(in)  :: ndir(3)     ! Normal vector
        real(wp), intent(out) :: tdirs(3,2)  ! Tangent vectors
        real(wp) :: s,a,b
        s = sign(1.0d0, ndir(3))
        a = -1.0d0/(s + ndir(3))
        b = ndir(1)*ndir(2)*a
        tdirs(:,1) = [1.0d0 + s*a*ndir(1)*ndir(1), s*b, -s*ndir(1)]
        tdirs(:,2) = [b, s + a*ndir(2)*ndir(2), -ndir(2)]
    end subroutine

end module
