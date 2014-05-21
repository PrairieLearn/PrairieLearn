function [ wts, ndx ] = ciqf ( nt, t, mlt, nwts, ndx, key, kind, alpha, ...
  beta, a, b, lo )

%*****************************************************************************80
%
%% CIQF computes weights for a classical weight function and any interval.
%
%  Discussion:
%
%    This routine compute somes or all the weights of a quadrature formula
%    for a classical weight function with any valid A, B and a given set of
%    knots and multiplicities.
%
%    The weights may be packed into the output array WTS according to a
%    user-defined pattern or sequentially.
%
%    The routine will also optionally print knots and weights and a check
%    of the moments.
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
%    Input, integer  MLT(NT), the multiplicity of the knots.
%
%    Input, integer NWTS, the number of weights.
%
%    Input, integer NDX(NT), used to index the output
%    array WTS.  If KEY = 1, then NDX need not be preset.  For more
%    details see the comments in CAWIQ.
%
%    Input, integer KEY, indicates the structure of the WTS
%    array.  It will normally be set to 1.  This will cause the weights to be
%    packed sequentially in array WTS.  For more details see the comments
%    in CAWIQ.
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
%    Input, real A, B, the interval endpoints.
%
%    Input, integer LO, selects the actions to perform.
%     > 0, compute and print weights.  Print moments check.
%     = 0, compute weights.
%     < 0, compute and print weights.
%
%    Output, real WTS(NWTS), the weights.
%
%    Output, integer NDX(NT), has been set if KEY was 1.
%
  m = 1;
  l = abs ( key );

  for j = 1: nt
    if ( l == 1 || abs ( ndx(j) ) ~= 0 )
      m = m + mlt(j);
    end
  end

  if ( nwts + 1 < m )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'CIQF - Fatal error!\n' );
    fprintf ( 1, '  NWTS + 1 < M.\n' );
    error ( 'CIQF - Fatal error!' );
  end

  mex = 2 + m;
%
%  Scale the knots to default A, B.
%
  st = sct ( nt, t, kind, a, b );

  lu = 0;

  [ wts, ndx ] = ciqfs ( nt, st, mlt, nwts, ndx, key, kind, alpha, beta, lu );
%
%  Don't scale user's knots - only scale weights.
%
  [ st, wts ] = scqf ( nt, st, mlt, wts, nwts, ndx, kind, alpha, beta, a, b );

  if ( lo == 0 )
    return
  end

  chkqf ( t, wts, mlt, nt, nwts, ndx, key, m - 1, mex, kind, ...
    alpha, beta, lo, a, b );

  return
end
