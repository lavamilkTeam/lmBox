module fb_algorithms

    use fb_parameters, only: wp
    use fb_utils, only: assert, abort
    implicit none
    private

    public :: sort, sorted, unique, uniqued

    interface sorted
        module procedure :: sorted_i
        module procedure :: sorted_r
        module procedure :: sorted_s
    end interface

    interface sort
        module procedure :: sort_i, sort_io
        module procedure :: sort_r, sort_ro
        module procedure :: sort_s, sort_so
    end interface

    interface uniqued
        module procedure :: uniqued_i
        module procedure :: uniqued_r
        module procedure :: uniqued_s
    end interface

    interface unique
        module procedure :: unique_i, unique_io
        module procedure :: unique_r, unique_ro
        module procedure :: unique_s, unique_so
    end interface

contains

    function sorted_i(values_in, order) result(values_out)
        integer, intent(in) :: values_in(:)
        integer, intent(out), optional, allocatable :: order(:)
        integer, allocatable :: values_out(:)
        values_out = values_in
        if (present(order)) then
            call sort(values_out, order)
        else
            call sort(values_out)
        endif
    end function

    subroutine sort_i(values)

        integer, intent(inout) :: values(:) ! data to be sorted
        integer :: vtmp         ! swap variables
        integer :: lu,ru,ld,rd  ! left/right heap indices during sift-up/sift-down
        integer :: n          ! input length

        ! input checking
        n = size(values)
        call assert(n > 0, "fb-sort: input array must have non-zero length.")
        if (n == 1) return

        ! sorting
        lu = (n/2) + 1
        ru = n
        do
            if (lu > 1) then
                ! sift-up: move the left boundary down, set the temp
                lu = lu - 1
                vtmp = values(lu)
            else
                ! sift-down: move min in the heap to low end of the sorted array
                vtmp = values(ru)
                values(ru) = values(1)
                ru = ru - 1
                if (ru == 1) then
                    values(1) = vtmp
                    return
                endif
            endif

            ! setup for sift-down
            ld = lu
            rd = lu + lu

            ! loop until right end of sorted region is after end of heap
            do while (rd <= ru)

                ! if not at the end of the heap, compare elements and expand
                ! sorted region if elements are ordered
                if (rd < ru) then
                    if (values(rd) < values(rd+1)) rd = rd + 1
                endif

                ! sift-down until the right element is sorted
                if (values(rd) >= vtmp) then
                    values(ld) = values(rd)
                    ld = rd
                    rd = rd + rd
                else
                    rd = ru + 1
                endif

            end do

            ! save temp values
            values(ld) = vtmp

        end do
    end subroutine

    subroutine sort_io(values, order)

        integer, intent(inout) :: values(:)            ! data to be sorted
        integer, intent(out), allocatable :: order(:)  ! index list defining sorted order

        integer :: vtmp, otmp    ! swap variables
        integer :: lu,ru,ld,rd,i ! left/right heap indices during sift-up/sift-down
        integer :: n           ! input length

        ! input checking
        n = size(values)
        call assert(n > 0,  "fb-sort: input arrays must have non-zero length.")
        order = [(i, i=1,n)]
        if (n == 1) return

        ! sorting
        lu = (n/2) + 1
        ru = n
        do
            if (lu > 1) then
                ! sift-up: move the left boundary down, set the temp
                lu = lu - 1
                vtmp = values(lu)
                otmp = order(lu)
            else
                ! sift-down: move min in the heap to low end of the sorted array
                vtmp = values(ru)
                otmp = order(ru)
                values(ru) = values(1)
                order(ru) = order(1)
                ru = ru - 1
                if (ru == 1) then
                    values(1) = vtmp
                    order(1) = otmp
                    return
                endif
            endif

            ! setup for sift-down
            ld = lu
            rd = lu + lu

            ! loop until right end of sorted region is after end of heap
            do while (rd <= ru)

                ! if not at the end of the heap, compare elements and expand
                ! sorted region if elements are ordered
                if (rd < ru) then
                    if (values(rd) < values(rd+1)) rd = rd + 1
                endif

                ! sift-down until the right element is sorted
                if (values(rd) >= vtmp) then
                    values(ld) = values(rd)
                    order(ld) = order(rd)
                    ld = rd
                    rd = rd + rd
                else
                    rd = ru + 1
                endif

            end do

            ! save temp values
            values(ld) = vtmp
            order(ld) = otmp

        end do
    end subroutine

    function sorted_r(values_in, order) result(values_out)
        real(wp), intent(in) :: values_in(:)
        integer, intent(out), optional, allocatable :: order(:)
        real(wp), allocatable :: values_out(:)
        values_out = values_in
        if (present(order)) then
            call sort(values_out, order)
        else
            call sort(values_out)
        endif
    end function

    subroutine sort_r(values)

        real(wp), intent(inout) :: values(:) ! data to be sorted
        real(wp) :: vtmp         ! swap variables
        integer :: lu,ru,ld,rd  ! left/right heap indices during sift-up/sift-down
        integer :: n          ! input length

        ! input checking
        n = size(values)
        call assert(n > 0, "fb-sort: input array must have non-zero length.")
        if (n == 1) return

        ! sorting
        lu = (n/2) + 1
        ru = n
        do
            if (lu > 1) then
                ! sift-up: move the left boundary down, set the temp
                lu = lu - 1
                vtmp = values(lu)
            else
                ! sift-down: move min in the heap to low end of the sorted array
                vtmp = values(ru)
                values(ru) = values(1)
                ru = ru - 1
                if (ru == 1) then
                    values(1) = vtmp
                    return
                endif
            endif

            ! setup for sift-down
            ld = lu
            rd = lu + lu

            ! loop until right end of sorted region is after end of heap
            do while (rd <= ru)

                ! if not at the end of the heap, compare elements and expand
                ! sorted region if elements are ordered
                if (rd < ru) then
                    if (values(rd) < values(rd+1)) rd = rd + 1
                endif

                ! sift-down until the right element is sorted
                if (values(rd) >= vtmp) then
                    values(ld) = values(rd)
                    ld = rd
                    rd = rd + rd
                else
                    rd = ru + 1
                endif

            end do

            ! save temp values
            values(ld) = vtmp

        end do
    end subroutine

    subroutine sort_ro(values, order)

        real(wp), intent(inout) :: values(:)            ! data to be sorted
        integer, intent(out), allocatable :: order(:)  ! index list defining sorted order

        real(wp) :: vtmp
        integer  :: otmp
        integer  :: lu,ru,ld,rd,i ! left/right heap indices during sift-up/sift-down
        integer  :: n           ! input length

        ! input checking
        n = size(values)
        call assert(n > 0,  "fb-sort: input arrays must have non-zero length.")
        order = [(i, i=1,n)]
        if (n == 1) return

        ! sorting
        lu = (n/2) + 1
        ru = n
        do
            if (lu > 1) then
                ! sift-up: move the left boundary down, set the temp
                lu = lu - 1
                vtmp = values(lu)
                otmp = order(lu)
            else
                ! sift-down: move min in the heap to low end of the sorted array
                vtmp = values(ru)
                otmp = order(ru)
                values(ru) = values(1)
                order(ru) = order(1)
                ru = ru - 1
                if (ru == 1) then
                    values(1) = vtmp
                    order(1) = otmp
                    return
                endif
            endif

            ! setup for sift-down
            ld = lu
            rd = lu + lu

            ! loop until right end of sorted region is after end of heap
            do while (rd <= ru)

                ! if not at the end of the heap, compare elements and expand
                ! sorted region if elements are ordered
                if (rd < ru) then
                    if (values(rd) < values(rd+1)) rd = rd + 1
                endif

                ! sift-down until the right element is sorted
                if (values(rd) >= vtmp) then
                    values(ld) = values(rd)
                    order(ld) = order(rd)
                    ld = rd
                    rd = rd + rd
                else
                    rd = ru + 1
                endif

            end do

            ! save temp values
            values(ld) = vtmp
            order(ld) = otmp

        end do
    end subroutine

    function sorted_s(values_in, order) result(values_out)
        character(*), intent(in) :: values_in(:)
        integer, intent(out), optional, allocatable :: order(:)
        character(len(values_in)), allocatable :: values_out(:)
        values_out = values_in
        if (present(order)) then
            call sort(values_out, order)
        else
            call sort(values_out)
        endif
    end function

    subroutine sort_s(values)

        character(*), intent(inout) :: values(:) ! data to be sorted
        character(len(values)) :: vtmp ! swap variables
        integer :: lu,ru,ld,rd  ! left/right heap indices during sift-up/sift-down
        integer :: n          ! input length

        ! input checking
        n = size(values)
        call assert(n > 0, "fb-sort: input array must have non-zero length.")
        if (n == 1) return

        ! sorting
        lu = (n/2) + 1
        ru = n
        do
            if (lu > 1) then
                ! sift-up: move the left boundary down, set the temp
                lu = lu - 1
                vtmp = values(lu)
            else
                ! sift-down: move min in the heap to low end of the sorted array
                vtmp = values(ru)
                values(ru) = values(1)
                ru = ru - 1
                if (ru == 1) then
                    values(1) = vtmp
                    return
                endif
            endif

            ! setup for sift-down
            ld = lu
            rd = lu + lu

            ! loop until right end of sorted region is after end of heap
            do while (rd <= ru)

                ! if not at the end of the heap, compare elements and expand
                ! sorted region if elements are ordered
                if (rd < ru) then
                    if (values(rd) < values(rd+1)) rd = rd + 1
                endif

                ! sift-down until the right element is sorted
                if (values(rd) >= vtmp) then
                    values(ld) = values(rd)
                    ld = rd
                    rd = rd + rd
                else
                    rd = ru + 1
                endif

            end do

            ! save temp values
            values(ld) = vtmp

        end do
    end subroutine

    subroutine sort_so(values, order)

        character(*), intent(inout) :: values(:)       ! data to be sorted
        integer, intent(out), allocatable :: order(:)  ! index list defining sorted order

        character(len(values)) :: vtmp
        integer :: otmp    ! swap variables
        integer :: lu,ru,ld,rd,i ! left/right heap indices during sift-up/sift-down
        integer :: n           ! input length

        ! input checking
        n = size(values)
        call assert(n > 0,  "fb-sort: input arrays must have non-zero length.")
        order = [(i, i=1,n)]
        if (n == 1) return

        ! sorting
        lu = (n/2) + 1
        ru = n
        do
            if (lu > 1) then
                ! sift-up: move the left boundary down, set the temp
                lu = lu - 1
                vtmp = values(lu)
                otmp = order(lu)
            else
                ! sift-down: move min in the heap to low end of the sorted array
                vtmp = values(ru)
                otmp = order(ru)
                values(ru) = values(1)
                order(ru) = order(1)
                ru = ru - 1
                if (ru == 1) then
                    values(1) = vtmp
                    order(1) = otmp
                    return
                endif
            endif

            ! setup for sift-down
            ld = lu
            rd = lu + lu

            ! loop until right end of sorted region is after end of heap
            do while (rd <= ru)

                ! if not at the end of the heap, compare elements and expand
                ! sorted region if elements are ordered
                if (rd < ru) then
                    if (values(rd) < values(rd+1)) rd = rd + 1
                endif

                ! sift-down until the right element is sorted
                if (values(rd) >= vtmp) then
                    values(ld) = values(rd)
                    order(ld) = order(rd)
                    ld = rd
                    rd = rd + rd
                else
                    rd = ru + 1
                endif

            end do

            ! save temp values
            values(ld) = vtmp
            order(ld) = otmp

        end do
    end subroutine

    function uniqued_i(values_in, map) result(values_out)
        integer, intent(in) :: values_in(:)
        integer, intent(out), optional, allocatable :: map(:)
        integer, allocatable :: values_out(:)
        integer :: num_unique
        values_out = values_in
        if (present(map)) then
            call unique(values_out, map, num_unique)
        else
            call unique(values_out, num_unique)
        endif
        values_out = values_out(:num_unique)
    end function

    subroutine unique_i(values, num_unique)
        integer, intent(inout) :: values(:)
        integer, intent(out) :: num_unique
        integer :: n, u
        u = 1
        do n = 2,size(values)
            if (values(n) < values(u)) call abort("fb-unique: input array must be sorted.")
            if (values(n) > values(u)) then
                u = u+1
                values(u) = values(n)
            end if
        end do
        num_unique = u
    end subroutine

    subroutine unique_io(values, map, num_unique)
        integer, intent(inout) :: values(:)
        integer, intent(out), allocatable :: map(:)
        integer, intent(out) :: num_unique
        integer :: n, u
        allocate(map(size(values)))
        map(1) = 1
        u = 1
        do n = 2,size(values)
            if (values(n) < values(u)) call abort("fb-unique: input array must be sorted.")
            if (values(n) > values(u)) then
                u = u+1
                values(u) = values(n)
            end if
            map(n) = u
        end do
        num_unique = u
    end subroutine

    function uniqued_r(values_in, map) result(values_out)
        real(wp), intent(in) :: values_in(:)
        integer, intent(out), optional, allocatable :: map(:)
        real(wp), allocatable :: values_out(:)
        integer :: num_unique
        values_out = values_in
        if (present(map)) then
            call unique(values_out, map, num_unique)
        else
            call unique(values_out, num_unique)
        endif
        values_out = values_out(:num_unique)
    end function

    subroutine unique_r(values, num_unique)
        real(wp), intent(inout) :: values(:)
        integer, intent(out) :: num_unique
        integer :: n, u
        u = 1
        do n = 2,size(values)
            if (values(n) < values(u)) call abort("fb-unique: input array must be sorted.")
            if (values(n) > values(u)) then
                u = u+1
                values(u) = values(n)
            end if
        end do
        num_unique = u
    end subroutine

    subroutine unique_ro(values, map, num_unique)
        real(wp), intent(inout) :: values(:)
        integer, intent(out), allocatable :: map(:)
        integer, intent(out) :: num_unique
        integer :: n, u
        allocate(map(size(values)))
        map(1) = 1
        u = 1
        do n = 2,size(values)
            if (values(n) < values(u)) call abort("fb-unique: input array must be sorted.")
            if (values(n) > values(u)) then
                u = u+1
                values(u) = values(n)
            end if
            map(n) = u
        end do
        num_unique = u
    end subroutine

    function uniqued_s(values_in, map) result(values_out)
        character(*), intent(in) :: values_in(:)
        integer, intent(out), optional, allocatable :: map(:)
        character(len(values_in)), allocatable :: values_out(:)
        integer :: num_unique
        values_out = values_in
        if (present(map)) then
            call unique(values_out, map, num_unique)
        else
            call unique(values_out, num_unique)
        endif
        values_out = values_out(:num_unique)
    end function

    subroutine unique_s(values, num_unique)
        character(*), intent(inout) :: values(:)
        integer, intent(out) :: num_unique
        integer :: n, u
        u = 1
        do n = 2,size(values)
            if (values(n) < values(u)) call abort("fb-unique: input array must be sorted.")
            if (values(n) > values(u)) then
                u = u+1
                values(u) = values(n)
            end if
        end do
        num_unique = u
    end subroutine

    subroutine unique_so(values, map, num_unique)
        character(*), intent(inout) :: values(:)
        integer, intent(out), allocatable :: map(:)
        integer, intent(out) :: num_unique
        integer :: n, u
        allocate(map(size(values)))
        map(1) = 1
        u = 1
        do n = 2,size(values)
            if (values(n) < values(u)) call abort("fb-unique: input array must be sorted.")
            if (values(n) > values(u)) then
                u = u+1
                values(u) = values(n)
            end if
            map(n) = u
        end do
        num_unique = u
    end subroutine

end module