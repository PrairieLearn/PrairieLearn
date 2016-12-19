function [ wts, ndx ] = ciqfs ( nt, t, mlt, nwts, ndx, key, kind, alpha, ...
  beta, lo )

%*****************************************************************************80
%
%% CIQFS computes some weights of a quadrature formula in the default interval.
%
%  Discussion:
%
%    This routine computes some or all the weights of a quadrature formula
%    for a classical weight function with default values of A and B,
%    and a given set of knots and multiplicities.
%
%    The weights may be packed into the output array WTS according to a
%    user-defined pattern or sequentially.
%
%    The routine will also optionally print knots and weights and a check of
%    the moments.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    10 February 2010
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
%    Input, integer NDX(NT),  used to index the output
%    array WTS.  If KEY = 1, then NDX need not be preset.  For more
%    details see the comments in CAWIQ.
%
%    Input, integer KEY, indicates the structure of the WTS
%    array.  It will normally be set to 1.  For more details see
%    the comments in CAWIQ.
%
%    Input, integer KIND, the rule.
%    1, Legendre,             (a,b)       1.0
%    2, Chebyshev Type 1,     (a,b)       ((b-x)*(x-a))^(-0.5)
%    3, Gegenbauer,           (a,b)       ((b-x)*(x-a))^alpha
%    4, Jacobi,               (a,b)       (b-x)^alpha*(x-a)^beta
%    5, Generalized Laguerre, (a,+oo)     (x-a)^alpha*exp(-b*(x-a))
%    6, Generalized Hermite,  (-oo,+oo)   |x-a|^alpha*exp(-b*(x-a)^2)
%    7, Exponential,          (a,b)       |x-(a+b)/2.0|^alpha
%    8, Rational,             (a,+oo)     (x-a)^alpha*(x+b)^beta
%    9, Chebyshev Type 2,     (a,b)       ((b-x)*(x-a))^(+0.5)
%
%    Input, real ALPHA, the value of Alpha, if needed.
%
%    Input, real BETA, the value of Beta, if needed.
%
%    Input, integer LO, selects the actions to perform.
%     > 0, compute and print weights.  Print moments check.
%     = 0, compute weights.
%     < 0, compute and print weights.
%
%    Output, real WTS(NWTS), the weights.
%
%    Output, integer NDX(NT), is returned by this routine if not set.
%
  jdf = 0;
  n = 0;
  l = abs ( key );

  for j = 1 : nt

    if ( l == 1 || abs ( ndx(j) ) ~= 0 )
      n = n + mlt(j);
    end

  end
%
%  N knots when counted according to multiplicity.
%
  if ( nwts < n )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'CIQFS - Fatal error!\n' );
    fprintf ( 1, '  NWTS < N.\n' );
    error ( 'CIQFS - Fatal error!' );
  end

  m = n + 1;
  mex = n + 3;
  nst = floor ( m / 2 );
%
%  Get the Jacobi matrix.
%
  [ aj, bj, zemu ] = class_matrix ( kind, nst, alpha, beta );
%
%  Call weights routine.
%
  [ wts, ndx ] = cawiq ( nt, t, mlt, n, ndx, key, nst, aj, bj, jdf, zemu );
%
%  Return if no printing or checking required.
%
  if ( lo == 0 )
    return
  end
%
%  Call checking routine.
%
  mop = m - 1;
  w = zeros ( mex, 1 );

  chkqfs ( t, wts, mlt, nt, n, ndx, key, mop, mex, kind, ...
    alpha, beta, lo, w );

  return
end
