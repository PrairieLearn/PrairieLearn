function [ t, wts ] = cgqfs ( nt, kind, alpha, beta, lo )

%*****************************************************************************80
%
%% CGQFS computes knots and weights of a Gauss quadrature formula.
%
%  Discussion:
%
%    This routine computes the knots and weights of a Gauss quadrature
%    formula with:
%
%    * a classical weight function with default values for a,b
%    * only simple knots
%    * optionally print knots and weights and a check of the moments
%
%    Use routine EIQFS to evaluate a quadrature formula computed by
%    this routine.
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
%    Input, integer LO, selects the action.
%    > 0, compute and print knots and weights.  Print moments check.
%    = 0, compute knots and weights.
%    < 0, compute and print knots and weights.
%
%    Output, real T(NT), the knots.
%
%    Output, real WTS(NT), the weights.
%

%
%  Compute the Gauss quadrature formula.
%
  [ t, wts ] = cdgqf ( nt, kind, alpha, beta );
%
%  Exit if no print required.
%
  if ( lo == 0 )
    return
  end

  key = 1;
  mop = 2 * nt;
  m = mop + 1;
  mmex = max ( 2 * nt + 3, 1 );
%
%  All knots have multiplicity = 1.
%
  mlt = zeros(nt,1);
  mlt(1:nt) = 1;
%
%  NDX(I) = I.
%
  ndx = ( 1 : nt );

  w = zeros(m,1);

  chkqfs ( t, wts, mlt, nt, nt, ndx, key, mop, mmex, ...
    kind, alpha, beta, lo, w );

  return
end
