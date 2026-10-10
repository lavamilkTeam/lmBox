! Utilies to augment iso_c_binding
module fb_c_binding

    use iso_c_binding
    implicit none

contains

    !------------------------------------------------------------------------
    ! Does not work in GCC
    !------------------------------------------------------------------------
    !subroutine c_f_strpointer(strarray, fstrptr, maxlen)
    !    ! Implements F202X intrinsic in F2008. Adapted from:
    !    !   https://community.intel.com/t5/Intel-Fortran-Compiler/New-Interoperability-Fortran-to-C-String-case/m-p/1144681/highlight/true#M138173
    !    character(kind=c_char), dimension(*), target, intent(in) :: strarray
    !    character(kind=c_char,len=:), pointer, intent(out) :: fstrptr
    !    integer, intent(in), optional :: maxlen
    !    integer :: n, nmax

    !    nmax = huge(0)
    !    if (present(maxlen)) nmax = maxlen

    !    n = 0
    !    do
    !        n = n+1
    !        if (n > nmax) exit
    !        if (strarray(n) == c_null_char) exit
    !    end do

    !    block
    !        character(n-1), pointer :: p
    !        call c_f_pointer(c_loc(strarray), p)
    !        fstrptr => p
    !    end block

    !end subroutine

end module