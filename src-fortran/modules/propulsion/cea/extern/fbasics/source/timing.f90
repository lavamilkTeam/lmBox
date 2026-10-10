module fb_timing

    use fb_parameters, only: wp
    use fb_logging
    implicit none

    ! A simple class to track execution time. Call tick() to start the timer,
    ! and tock() to stop it. You can call tick/tock multiple times, and the
    ! timer will record the average duration. This is useful for computing the
    ! average running time of a subroutine. Note that this is NOT wall clock
    ! time; it's the time the CPU is active.
    type :: timer
        integer  :: count = 0
        real(wp) :: last_tick       = 0.0d0
        real(wp) :: last_tock       = 0.0d0
        real(wp) :: last_elapsed    = 0.0d0
        real(wp) :: average_elapsed = 0.0d0
    contains
        procedure :: tick => timer_tick
        procedure :: tock => timer_tock
    end type

contains

    subroutine timer_tick(self)
        class(timer), intent(inout) :: self
        real(wp) :: current_time
        call cpu_time(current_time)
        if (self%last_tick > self%last_tock) then
            call log_error("fb-timer: No tock() since last tick(). Reseting timer.")
        endif
        self%last_tick = current_time
        return
    end subroutine

    subroutine timer_tock(self)
        class(timer), intent(inout) :: self
        double precision :: k
        real :: current_time
        call cpu_time(current_time)
        if (self%last_tock > self%last_tick) then
            call log_error("fb-timer: No tick() since last tock(). Ignoring tock().")
            return
        end if

        ! Save latest data
        self%count        = self%count+1
        self%last_tock    = current_time
        self%last_elapsed = self%last_tock - self%last_tick

        ! Compute the running mean
        k = 1.0d0/self%count
        self%average_elapsed = (1.0d0-k)*self%average_elapsed + k*self%last_elapsed

        return
    end subroutine

end module
