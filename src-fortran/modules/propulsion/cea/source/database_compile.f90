module cea_db_compile
    use cea_param, only: dp, species_name_len, element_name_len
    use fb_logging
    implicit none
    private

    integer, parameter :: max_elem_per_species = 5
    integer, parameter :: num_fit_g = 3
    integer, parameter :: num_coefs = 9

    public :: compile_thermo_database
    public :: compile_transport_database

contains

    subroutine compile_thermo_database(filename, ok)
        character(*), intent(in) :: filename
        logical, intent(out) :: ok
        integer :: ioinp, ioout, iosch, iothm
        logical :: exists, found

        ok = .false.
        inquire(file=trim(filename), exist=exists)
        if (.not. exists) then
            call log_error('Thermo input file not found: '//trim(filename))
            return
        end if

        call log_info('Compiling thermo database from: '//trim(filename))
        open(newunit=ioinp, file=trim(filename), status='old', action='read', form='formatted')
        open(newunit=ioout, file='thermo.out', status='replace', action='write', form='formatted')
        open(newunit=iosch, status='scratch', form='unformatted')
        open(newunit=iothm, file='thermo.lib', status='replace', action='write', form='unformatted')

        call seek_keyword(ioinp, 'ther', found)
        if (.not. found) then
            call log_error('Expected "thermo" header not found in '//trim(filename))
            close(ioinp)
            close(ioout)
            close(iosch)
            close(iothm)
            return
        end if

        ok = .true.
        call utherm(ioinp, ioout, iosch, iothm, ok)

        close(ioinp)
        close(ioout)
        close(iosch)
        close(iothm)
    end subroutine

    subroutine compile_transport_database(filename, ok)
        character(*), intent(in) :: filename
        logical, intent(out) :: ok
        integer :: ioinp, ioout, iosch, iotrn
        logical :: exists, found

        ok = .false.
        inquire(file=trim(filename), exist=exists)
        if (.not. exists) then
            call log_error('Transport input file not found: '//trim(filename))
            return
        end if

        call log_info('Compiling transport database from: '//trim(filename))
        open(newunit=ioinp, file=trim(filename), status='old', action='read', form='formatted')
        open(newunit=ioout, file='trans.out', status='replace', action='write', form='formatted')
        open(newunit=iosch, status='scratch', form='unformatted')
        open(newunit=iotrn, file='trans.lib', status='replace', action='write', form='unformatted')

        call seek_keyword(ioinp, 'tran', found)
        if (.not. found) then
            call log_error('Expected "transport" header not found in '//trim(filename))
            close(ioinp)
            close(ioout)
            close(iosch)
            close(iotrn)
            return
        end if

        ok = .true.
        call utran(ioinp, ioout, iosch, iotrn, ok)

        close(ioinp)
        close(ioout)
        close(iosch)
        close(iotrn)
    end subroutine

    subroutine seek_keyword(ioinp, keyword, found)
        integer, intent(in) :: ioinp
        character(*), intent(in) :: keyword
        logical, intent(out) :: found
        character(256) :: line
        character(256) :: token
        integer :: ios, split

        found = .false.
        do
            read(ioinp, '(A)', iostat=ios) line
            if (ios < 0) exit
            if (ios > 0) cycle

            line = adjustl(line)
            if (len_trim(line) == 0) cycle
            if (line(1:1) == '!' .or. line(1:1) == '#') cycle

            split = index(line, ' ')
            if (split == 0) then
                token = line(1:len_trim(line))
            else
                token = line(1:split-1)
            end if

            if (len_trim(token) < len(keyword)) cycle
            if (to_lower(token(1:len(keyword))) == keyword) then
                found = .true.
                exit
            end if
        end do
    end subroutine

    pure function to_lower(str) result(out)
        character(len=*), intent(in) :: str
        character(len=len(str)) :: out
        integer :: i, c

        do i = 1, len(str)
            c = iachar(str(i:i))
            if (c >= iachar('A') .and. c <= iachar('Z')) then
                out(i:i) = achar(c + 32)
            else
                out(i:i) = str(i:i)
            end if
        end do
    end function

    subroutine utherm(ioinp, ioout, iosch, iothm, readok)
        integer, intent(in) :: ioinp, ioout, iosch, iothm
        logical, intent(inout) :: readok
        character(species_name_len) :: name
        character(species_name_len+1) :: namee
        character(65) :: notes
        character(element_name_len) :: sym(max_elem_per_species)
        character(6) :: date
        character(10) :: thdate
        integer :: i, ifaz, ifzm1, inew, int, j, k, kk, l, nall, ncoef, ngl, ns, ntl
        logical :: fill(num_fit_g)
        real(dp) :: aa, atms, cpfix, dlt, expn(8), fno(max_elem_per_species), hform, hh
        real(dp) :: mwt, templ(num_coefs), tex, tgl(num_fit_g+1), thermo(num_coefs, num_fit_g)
        real(dp) :: tinf, tl(2), ttl, tx

        ngl = 0
        ns = 0
        nall = 0
        ifzm1 = 0
        inew = 0
        tinf = 1.0d6
        rewind iosch
        read (ioinp, 99001) tgl, thdate
 100    do i = 1, num_fit_g
            fill(i) = .true.
            do j = 1, num_coefs
                thermo(j, i) = 0.0d0
            end do
        end do
        hform = 0.0d0
        tl(1) = 0.0d0
        tl(2) = 0.0d0
        read (ioinp, 99002, end=300, err=400) name, notes
        if (name(:3) == 'END' .or. name(:3) == 'end') then
            if (index(name, 'ROD') == 0 .and. index(name, 'rod') == 0) goto 300
            ns = nall
            goto 100
        end if
        read (ioinp, 99003, err=400) ntl, date, (sym(j), fno(j), j=1, max_elem_per_species), &
                                    ifaz, mwt, hform
        write (ioout, 99004) name, date, hform, notes
        if (ntl == 0) then
            if (ns == 0) goto 300
            nall = nall + 1
            read (ioinp, 99005, err=400) tl, ncoef, expn, hh
            thermo(1, 1) = hform
            write (iosch) name, ntl, date, (sym(j), fno(j), j=1, max_elem_per_species), ifaz, tl, mwt, &
                          thermo
            goto 100
        else if (name == 'Air') then
            sym(1) = 'N'
            fno(1) = 1.56168d0
            sym(2) = 'O'
            fno(2) = 0.419590d0
            sym(3) = 'AR'
            fno(3) = 0.009365d0
            sym(4) = 'C'
            fno(4) = 0.000319d0
        else if (name == 'e-') then
            mwt = 5.48579903d-04
        end if
        do 200 i = 1, ntl
            read (ioinp, 99005, err=400) tl, ncoef, expn, hh
            read (ioinp, 99006, err=400) templ
            if (ifaz == 0 .and. i > num_fit_g) goto 400
            if (ifaz <= 0) then
                if (tl(2) > tgl(4) - 0.01d0) then
                    ifaz = -1
                    namee = '*'//name
                    name = namee(:species_name_len)
                end if
                if (tl(1) >= tgl(i+1)) goto 200
                int = i
                fill(i) = .false.
            else
                int = 1
                if (i > 1) then
                    do k = 1, 7
                        thermo(k, 1) = 0.0d0
                    end do
                end if
            end if
            do 150 l = 1, ncoef
                do k = 1, 7
                    if (expn(l) == dble(k-3)) then
                        thermo(k, int) = templ(l)
                        goto 150
                    end if
                end do
 150        continue
            thermo(8, int) = templ(8)
            thermo(9, int) = templ(9)
            if (ifaz > 0) then
                nall = nall + 1
                if (ifaz > ifzm1) then
                    inew = inew + 1
                else
                    inew = i
                end if
                write (iosch) name, ntl, date, (sym(j), fno(j), j=1, max_elem_per_species), inew, tl, mwt, &
                              thermo
            end if
 200    continue
        ifzm1 = ifaz
        if (ifaz <= 0) then
            inew = 0
            nall = nall + 1
            if (ifaz <= 0 .and. ns == 0) then
                ngl = ngl + 1
                if (fill(3)) then
                    atms = 0.0d0
                    do i = 1, max_elem_per_species
                        if (sym(i) == ' ' .or. sym(i) == 'E') goto 210
                        atms = atms + fno(i)
                    end do
 210                aa = 2.5d0
                    if (atms > 1.9d0) aa = 4.5d0
                    if (atms > 2.1d0) aa = 3.0d0*atms - 1.75d0
                    ttl = tl(2)
                    tx = ttl - tinf
                    cpfix = 0.0d0
                    templ(8) = 0.0d0
                    templ(9) = 0.0d0
                    dlt = log(ttl)
                    do k = 7, 1, -1
                        kk = k - 3
                        if (kk == 0) then
                            cpfix = cpfix + thermo(k, 2)
                            templ(8) = templ(8) + thermo(k, 2)
                            templ(9) = templ(9) + thermo(k, 2)*dlt
                        else
                            tex = ttl**kk
                            cpfix = cpfix + thermo(k, 2)*tex
                            templ(9) = templ(9) + thermo(k, 2)*tex/kk
                            if (kk == -1) then
                                templ(8) = templ(8) + thermo(k, 2)*dlt/ttl
                            else
                                templ(8) = templ(8) + thermo(k, 2)*tex/(kk+1)
                            end if
                        end if
                    end do
                    templ(2) = (cpfix-aa)/tx
                    thermo(4, 3) = templ(2)
                    templ(1) = cpfix - ttl*templ(2)
                    thermo(3, 3) = templ(1)
                    thermo(8, 3) = thermo(8, 2) + ttl*(templ(8)-templ(1)-0.5d0*templ(2)*ttl)
                    thermo(9, 3) = -templ(1)*dlt + thermo(9, 2) + templ(9) - templ(2)*ttl
                end if
            end if
            write (iosch) name, ntl, date, (sym(j), fno(j), j=1, max_elem_per_species), ifaz, tl, mwt, thermo
        end if
        goto 100
 300    rewind iosch
        if (ns == 0) ns = nall
        write (iothm) tgl, ngl, ns, nall, thdate
        if (ngl /= 0) then
            do i = 1, ns
                read (iosch) name, ntl, date, (sym(j), fno(j), j=1, max_elem_per_species), ifaz, tl, mwt, thermo
                if (ifaz <= 0) write (iothm) name, ntl, date, (sym(j), fno(j), j=1, max_elem_per_species), &
                                               ifaz, tl, mwt, thermo
            end do
        end if
        if (ngl /= nall) then
            rewind iosch
            do i = 1, nall
                read (iosch) name, ntl, date, (sym(j), fno(j), j=1, max_elem_per_species), ifaz, tl, mwt, thermo
                if (i > ns) then
                    write (iothm) name, ntl, date, (sym(j), fno(j), j=1, max_elem_per_species), ifaz, tl, mwt, &
                                  thermo(1, 1)
                    if (ntl > 0) write (iothm) thermo
                else if (ifaz > 0) then
                    write (iothm) name, ntl, date, (sym(j), fno(j), j=1, max_elem_per_species), ifaz, tl, mwt, &
                                  (thermo(k, 1), k=1, num_coefs)
                end if
            end do
        end if
        return
 400    write (ioout, 99007) name
        readok = .false.
        return
 99001  format (4f10.3, a10)
 99002  format (a15, a65)
 99003  format (i2, 1x, a6, 1x, 5(a2, f6.2), i2, f13.5, f15.3)
 99004  format (' ', a15, 2x, a6, e15.6, 2x, a65)
 99005  format (2f11.3, i1, 8f5.1, 2x, f15.3)
 99006  format (5d16.8/2d16.8, 16x, 2d16.8)
 99007  format (/' ERROR IN PROCESSING thermo.inp AT OR NEAR ', a15, ' (UTHERM)')
    end subroutine

    subroutine utran(ioinp, ioout, iosch, iotrn, readok)
        integer, intent(in) :: ioinp, ioout, iosch, iotrn
        logical, intent(inout) :: readok
        character(16) :: tname(2)
        character(1) :: vorc, vvl, cc
        integer :: i, ic, in, iv, j, k, ncc, nn, ns, nv
        real(dp) :: tc(36), tcin(6), trcoef(6, 3, 2)

        equivalence (tc(1), trcoef(1, 1, 1))
        ns = 0
        rewind iosch
 100    do i = 1, 36
            tc(i) = 0.0d0
        end do
        read (ioinp, 99001) tname, vvl, nv, cc, ncc
        if (tname(1) == 'end' .or. tname(1) == 'LAST') then
            write (iotrn) ns
            rewind iosch
            do i = 1, ns
                read (iosch, err=200) tname, trcoef
                write (iotrn) tname, trcoef
            end do
            goto 300
        else
            ic = 0
            iv = 0
            nn = nv + ncc
            if (nv <= 3 .and. ncc <= 3) then
                do in = 1, nn
                    read (ioinp, 99002) vorc, tcin
                    if (vorc == 'C') then
                        k = 2
                        ic = ic + 1
                        j = ic
                    else
                        k = 1
                        iv = iv + 1
                        j = iv
                    end if
                    if (j > 3) goto 200
                    do i = 1, 6
                        trcoef(i, j, k) = tcin(i)
                    end do
                end do
                ns = ns + 1
                write (iosch) tname, trcoef
                goto 100
            end if
        end if
 200    write (ioout, 99003) tname
        readok = .false.
 300    return
 99001  format (2a16, 2x, a1, i1, a1, i1)
 99002  format (1x, a1, 2f9.2, 4e15.8)
 99003  format (/' ERROR IN PROCESSING trans.inp AT OR NEAR (UTRAN)', /1x, 2a16)
    end subroutine

end module
