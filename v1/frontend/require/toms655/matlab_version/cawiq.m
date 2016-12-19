function [ wts, ndx, jdf ] = cawiq ( nt, t, mlt, nwts, ndx, key, nst, aj, bj, ...
  jdf, zemu )

%*****************************************************************************80
%
%% CAWIQ computes quadrature weights for a given set of knots.
%
%  Discussion:
%
%    This routine is given a set of distinct knots, T, their multiplicities MLT,
%    the Jacobi matrix associated with the polynomials orthogonal with respect
%    to the weight function W(X), and the zero-th moment of W(X).
%
%    It computes the weights of the quadrature formula
%
%      sum ( 1 <= J <= NT ) sum ( 0 <= I <= MLT(J) - 1 ) wts(j) d^i/dx^i f(t(j))
%
%    which is to approximate
%
%      integral ( a < x < b ) f(t) w(t) dt
%
%    The routine makes various checks, as indicated below, sets up
%    various vectors and, if necessary, calls for the diagonalization
%    of the Jacobi matrix that is associated with the polynomials
%    orthogonal with respect to W(X) on the interval A, B.
%
%    Then for each knot, the weights of which are required, it calls the
%    routine CWIQD which to compute the weights.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    05 January 2010
%
%  Author:
%
%    Original FORTRAN77 version by Sylvan Elhay, Jaroslav Kautsky.
%    MATLAB version by John Burkardt.
%
%  Reference:
%
%    Sylvan Elhay, Jaroslav Kautsky,
%    Algorithm 655: IQPACK, FORTRAN Subroutines for the Weights of
%    Interpolatory Quadrature,
%    ACM Transactions on Mathematical Software,
%    Volume 13, Number 4, December 1987, pages 399-415.
%
%  Parameters:
%
%    Input, integer NT, the number of knots.
%
%    Input, real T(NT), the knots.
%
%    Input, integer MLT(NT), the multiplicity of the knots.
%
%    Input, integer NWTS, the number of weights.
%
%    Input, integer NDX(NT), associates with each distinct
%    knot T(J), an integer NDX(J) which is such that the weight to the I-th
%    derivative value of F at the J-th knot, is stored in
%      WTS(abs(NDX(J))+I) for J = 1,2,...,NT, and I = 0,1,2,...,MLT(J)-1.
%    The sign of NDX includes the following information:
%    > 0, weights are wanted for this knot
%    < 0, weights not wanted for this knot but it is included in the quadrature
%    = 0. means ignore this knot completely.
%
%    Input, integer KEY, indicates structure of WTS and NDX.
%    KEY is an integer with absolute value between 1 and 4.
%    The sign of KEY choosed the form of WTS:
%    0 < KEY, WTS in standard form.
%    0 > KEY, J]WTS(J) required.
%    The absolute value has the following effect:
%    1, set up pointers in NDX for all knots in T array (routine cawiq does
%    this).  the contents of ndx are not tested on input and weights are
%    packed sequentially in wts as indicated above.
%    2, set up pointers only for knots which have nonzero NDX on input.  All
%    knots which have a non-zero flag are allocated space in WTS.
%    3, set up pointers only for knots which have ndx > 0 on input. space in
%    wts allocated only for knots with ndx > 0
%    4, ndx assumed to be preset as pointer array on input.
%
%    Input, integer NST, the dimension of the Jacobi matrix.
%    NST should be between (N+1)/2 and N.  The usual choice will be (N+1)/2.
%
%    Input, real AJ(NST), BJ(NST).
%    If JDF = 0 then AJ contains the  diagonal of the Jacobi matrix and
%    BJ(1:NST-1) contains the subdiagonal.
%    If JDF = 1, AJ contains the eigenvalues of the Jacobi matrix and
%    BJ contains the squares of the elements of the first row of U, the
%    orthogonal matrix which diagonalized the Jacobi matrix as U*D*U'.
%
%    Input, integer JDF, indicates whether the Jacobi
%    matrix needs to be diagonalized.
%    0, diagonalization required;
%    1, diagonalization not required.
%
%    Input, real ZEMU, the zero-th moment of the weight
%    function W(X).
%
%    Output, real WTS(NWTS), the weights.
%
%    Output, integer NDX(NT), the updated array, if KEY = 1.
%
%    Output, integer JDF, indicates whether the Jacobi
%    matrix needs to be diagonalized.
%    0, diagonalization required;
%    1, diagonalization not required.
%
  wts = zeros ( nwts, 1 );
  
  prec = eps;

  if ( nt < 1 )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'CAWIQ - Fatal error!\n' );
    fprintf ( 1, '  NT < 1.\n' );
    error ( 'CAWIQ - Fatal error!' );
  end
%
%  Check for indistinct knots.
%
  if ( 1 < nt )

    k = nt - 1;

    for i = 1 : k
      tmp = t(i);
      l = i + 1;
      for j = l : nt
        if ( abs ( tmp - t(j) ) <= prec )
          fprintf ( 1, '\n' );
          fprintf ( 1, 'CAWIQ - Fatal error!\n' );
          fprintf ( 1, '  Knots too close.\n' );
          error ( 'CAWIQ - Fatal error!' );
        end
      end

    end

  end
%
%  Check multiplicities,
%  Set up various useful parameters and
%  set up or check pointers to WTS array.
%
  l = abs ( key );

  if ( l < 1 || 4 < l )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'CAWIQ - Fatal error!\n' );
    fprintf ( 1, '  Magnitude of KEY not between 1 and 4.\n' );
    error ( 'CAWIQ - Fatal error!' );
  end

  k = 1;

  if ( l == 1 )

    for i = 1 : nt
      ndx(i) = k;
      if ( mlt(i) < 1 )
        fprintf ( 1, '\n' );
        fprintf ( 1, 'CAWIQ - Fatal error!\n' );
        fprintf ( 1, '  MLT(I) < 1.\n' );
        error ( 'CAWIQ - Fatal error!' );
      end
      k = k + mlt(i);
    end

    n = k - 1;

  elseif ( l == 2 || l == 3 )

    n = 0;

    for i = 1 : nt

      if ( ndx(i) == 0 )
        continue
      end

      if ( mlt(i) < 1 )
        fprintf ( 1, '\n' );
        fprintf ( 1, 'CAWIQ - Fatal error!\n' );
        fprintf ( 1, '  MLT(I) < 1.\n' );
        error ( 'CAWIQ - Fatal error!' );
      end

      n = n + mlt(i);

      if ( ndx(i) < 0 && l == 3 )
        continue
      end

      ndx(i) = abs ( k ) * i4_sign ( ndx(i) );
      k = k + mlt(i);

    end

    if ( nwts + 1 < k )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'CAWIQ - Fatal error!\n' );
      fprintf ( 1, '  NWTS + 1 < K.\n' );
      error ( 'CAWIQ - Fatal error!' );
    end

  elseif ( l == 4 )

    for i = 1 : nt
      ip = abs ( ndx(i) );
      if ( ip == 0 )
        continue
      end
      ipm = ip + mlt(i);

      if ( nwts < ipm )
        fprintf ( 1, '\n' );
        fprintf ( 1, 'CAWIQ - Fatal error!\n' );
        fprintf ( 1, '  NWTS < IPM.\n' );
        error ( 'CAWIQ - Fatal error!' );
      end

      if ( i == nt )
        break
      end

      l = i + 1;
      for j = l : nt
        jp = abs ( ndx(j) );
        if ( jp ~= 0 )
          if ( jp <= ipm && ip <= jp + mlt(j) )
            break
          end
        end
      end
    end

  end
%
%  Test some parameters.
%
  if ( nst < floor ( ( n + 1 ) / 2 ) )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'CAWIQ - Fatal error!\n' );
    fprintf ( 1, '  NST < ( N + 1 ) / 2.\n' );
    error ( 'CAWIQ - Fatal error!' );
  end

  if ( zemu <= 0.0 )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'CAWIQ - Fatal error!\n' );
    fprintf ( 1, '  ZEMU <= 0.\n' );
    error ( 'CAWIQ - Fatal error!' );
  end
%
%  Treat a quadrature formula with 1 simple knot first.
%
  if ( n <= 1 )

    for i = 1 : nt
      if ( 0 < ndx(i) )
        wts( abs ( ndx(i) ) ) = zemu;
        return
      end
    end

  end
%
%  Carry out diagonalization if not already done.
%
  if ( jdf == 0 )
%
%  Set unit vector in work field to get back first row of Q.
%
    z = zeros(1:nst);
    z(1) = 1.0;
%
%  Diagonalize the Jacobi matrix.
%
    [ aj, z ] = imtqlx ( nst, aj, bj, z );
%
%  Signal Jacobi matrix now diagonalized successfully and save
%  squares of first row of U in subdiagonal array.
%
    jdf =1;
    for i = 1 : nst
      bj(i) = z(i) * z(i);
    end

  end
%
%  Find all the weights for each knot flagged.
%
  for i = 1 : nt

    if ( ndx(i) <= 0 )
      cycle
    end

    m = mlt(i);
    nm = n - m;
    mnm = max ( nm, 1 );
    l = min ( m, nm + 1 );
%
%  Set up K-hat matrix for CWIQD with knots according to
%  their multiplicities.
%
    xk = zeros(mnm,1);
    k = 1;
    for j = 1 : nt
      if ( ndx(j) ~= 0 )
        if ( j ~= i )
          for jj = 1 : mlt(j)
            xk(k) = t(j);
            k = k + 1;
          end
        end
      end
    end
%
%  Set up right principal vector array for weights routine.
%
    r = zeros(l,1);
    r(1) = 1.0 / zemu;
%
%  Pick up pointer for the location of the weights to be output.
%
    k = ndx(i);
%
%  Find all the weights for this knot.
%
    wts(k:k+m-1) = cwiqd ( m, mnm, l, t(i), xk, nst, aj, bj, r );

    if ( key < 0 )
      continue
    end
%
%  Divide by factorials for weights in standard form.
%
    tmp = 1.0;
    for j = 2 : m - 1
      p = j;
      tmp = tmp * p;
      l = k + j;
      wts(l) = wts(l) / tmp;
    end

  end

  return
end
