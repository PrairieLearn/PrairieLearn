function [ t, wts ] = cdgqf ( nt, kind, alpha, beta )

%*****************************************************************************80
%
%% CDGQF computes a Gauss quadrature formula with default A, B and simple knots.
%
%  Discussion:
%
%    This routine computes all the knots and weights of a Gauss quadrature
%    formula with a classical weight function with default values for A and B,
%    and only simple knots.
%
%    There are no moments checks and no printing is done.
%
%    Use routine EIQFS to evaluate a quadrature computed by CGQFS.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    04 January 2010
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
%    Output, real T(NT), the knots.
%
%    Output, real WTS(NT), the weights.
%
  parchk ( kind, 2 * nt, alpha, beta );
%
%  Get the Jacobi matrix and zero-th moment.
%
  [ aj, bj, zemu ] = class_matrix ( kind, nt, alpha, beta );
%
%  Compute the knots and weights.
%
  [ t, wts ] = sgqf ( nt, aj, bj, zemu );

  return
end
