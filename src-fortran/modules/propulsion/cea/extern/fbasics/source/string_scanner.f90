module fb_string_scanner

    use fb_parameters, only: wp
    use fb_logging
    use fb_utils
    implicit none
    private

    ! Parameters
    character(1), parameter :: null_char  = achar(0)
    character(1), parameter :: space_char = achar(32)

    ! A utility class for parsing strings word-by-word.
    type, public:: string_scanner
        private
        character(:), allocatable :: buffer
        integer :: pos, len
    contains
        procedure :: append       => ss_append
        procedure :: peek_char    => ss_peek_char
        procedure :: peek_word    => ss_peek_word
        procedure :: peek_int     => ss_peek_int
        procedure :: peek_real    => ss_peek_real
        procedure :: peek_logical => ss_peek_logical
        procedure :: read_char    => ss_read_char
        procedure :: read_word    => ss_read_word
        procedure :: read_int     => ss_read_int
        procedure :: read_real    => ss_read_real
        procedure :: read_logical => ss_read_logical
    end type
    interface string_scanner
        module procedure :: ss_init
    end interface


contains

    function ss_init(buffer) result(self)
        type(string_scanner) :: self
        character(*), intent(in) :: buffer
        self%buffer = buffer
        self%pos = 1
        self%len = len(self%buffer)
    end function

    subroutine ss_append(self, buffer)
        class(string_scanner) :: self
        character(*), intent(in) :: buffer
        self%buffer = self%buffer // buffer
        self%len = len(self%buffer)
    end subroutine

    function ss_peek_char(self,ios) result(c)
        ! Return next character without advancing buffer position
        class(string_scanner), intent(in) :: self
        character(1) :: c
        integer, optional :: ios
        if (self%pos <= self%len) then
            call set_ios(0, ios)
            c = self%buffer(self%pos:self%pos)
        else
            call set_ios(-1, ios, 'buffer exhausted')
            c = null_char
        end if
    end function

    function ss_read_char(self,ios) result(c)
        ! Return next character and advance buffer position
        class(string_scanner), intent(inout) :: self
        character(1) :: c
        integer, optional :: ios
        if (self%pos <= self%len) then
            call set_ios(0, ios)
            c = self%buffer(self%pos:self%pos)
            self%pos = self%pos+1
        else
            call set_ios(-1, ios, 'buffer exhausted')
            c = null_char
        end if
    end function

    function ss_peek_word(self,ios) result(word)
        ! Return next word without advancing buffer position

        class(string_scanner), intent(in) :: self
        character(:), allocatable :: word
        integer, optional :: ios
        integer :: i,j

        ! Locate start of word
        do i = self%pos,self%len
            if (self%buffer(i:i) > space_char) exit
        end do

        ! Locate end of word
        do j = i+1,self%len
            if (self%buffer(j:j) <= space_char) exit
        end do

        ! Return substring
        if (i <= self%len) then
            word = self%buffer(i:j-1)
            call set_ios(0, ios)
        else
            word = ''
            call set_ios(-1, ios, 'buffer exhausted.')
        end if

    end function

    function ss_read_word(self,ios) result(word)
        ! Return next word and advance buffer position

        class(string_scanner), intent(inout) :: self
        character(:), allocatable :: word
        integer, optional :: ios
        integer :: i,j

        ! Locate start of word
        do i = self%pos,self%len
            self%pos = self%pos+1
            if (self%buffer(i:i) > space_char) exit
        end do

        ! Locate end of word
        do j = i+1,self%len
            self%pos = self%pos+1
            if (self%buffer(j:j) <= space_char) exit
        end do

        ! Return substring & advance pos
        if (i <= self%len) then
            word = self%buffer(i:j-1)
            call set_ios(0, ios)
        else
            word = ''
            call set_ios(-1, ios, 'buffer exhausted.')
        end if

    end function

    function ss_peek_int(self,ios) result(value)
        ! Read integer from buffer without advancing buffer position
        class(string_scanner), intent(in) :: self
        integer, optional :: ios
        integer :: value
        character(:), allocatable :: word
        word = self%peek_word(ios)
        if (len(word) == 0) then
            value = empty_int
        else
            value = to_int(word,ios)
        end if
    end function

    function ss_read_int(self,ios) result(value)
        ! Read integer from buffer and advance buffer position
        class(string_scanner), intent(inout) :: self
        integer, optional :: ios
        integer :: value
        character(:), allocatable :: word
        word = self%read_word(ios)
        if (len(word) == 0) then
            value = empty_int
        else
            value = to_int(word,ios)
        end if
    end function

    function ss_peek_real(self,ios) result(value)
        ! Read real value from buffer without advancing buffer position
        class(string_scanner), intent(in) :: self
        integer, optional :: ios
        real(wp) :: value
        character(:), allocatable :: word
        word = self%peek_word(ios)
        if (len(word) == 0) then
            value = empty_real
        else
            value = to_real(word,ios)
        end if
    end function

    function ss_read_real(self,ios) result(value)
        ! Read real value from buffer and advance buffer position
        class(string_scanner), intent(inout) :: self
        integer, optional :: ios
        real(wp) :: value
        character(:), allocatable :: word
        word = self%read_word(ios)
        if (len(word) == 0) then
            value = empty_real
        else
            value = to_real(word,ios)
        end if
    end function

    function ss_peek_logical(self,ios) result(value)
        ! Read logical from buffer without advancing buffer position
        class(string_scanner), intent(in) :: self
        integer, optional :: ios
        logical :: value
        character(:), allocatable :: word
        word = self%peek_word(ios)
        if (len(word) == 0) then
            value = .false.
        else
            value = to_logical(word,ios)
        end if
    end function

    function ss_read_logical(self,ios) result(value)
        ! Read logical from buffer and advance buffer position
        class(string_scanner), intent(inout) :: self
        integer, optional :: ios
        logical :: value
        character(:), allocatable :: word
        word = self%read_word(ios)
        if (len(word) == 0) then
            value = .false.
        else
            value = to_logical(word,ios)
        end if
    end function

    subroutine set_ios(value, ios, message)
        ! Set an optional iostat flag. If no ios and value /= 0, aborts.
        integer, intent(in) :: value
        integer, intent(out), optional :: ios
        character(*), intent(in), optional :: message
        character(:), allocatable :: msg
        if (present(ios)) then
            ios = value
        else if (value /= 0) then
            msg = 'string_scanner: '
            if (present(message)) msg = msg // message
            call abort(msg)
        end if
    end subroutine

end module

