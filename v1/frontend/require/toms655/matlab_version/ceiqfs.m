function qfsum = ceiqfs ( nt, t, mlt, kind, alpha, beta, f )

%*****************************************************************************80
%
%% CEIQFS computes and applies a quadrature formula based on user knots.
%
%  Discussion:
%
%    The knots may have multiplicity.  The quadrature interval is over
%    the standard interval A, B for the classical weight function selected
%    by the user.
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
%    Input, function F, the name of a routine which
%    evaluates the function and some of its derivatives.  The routine
%    must have the form
%      function value = f ( x, i )
%    and return in VALUE the value of the I-th derivative of the function
%    at X.  The highest value of I will be the maximum value in MLT minus
%    one.  The value X will always be a knot.
%
%    Output, real QFSUM, the value of the quadrature formula
%    applied to F.
%
  lu = 0;
  n = sum ( mlt(1:nt) );
  key = 1;
  ndx = zeros(nt,1);

  [ wts, ndx ] = ciqfs ( nt, t, mlt, n, ndx, key, kind, alpha, beta, lu );

  qfsum = eiqf ( nt, t, mlt, wts, n, ndx, key, f );

  return
end
