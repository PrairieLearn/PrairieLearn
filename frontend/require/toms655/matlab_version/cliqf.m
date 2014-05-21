function wts = cliqf ( nt, t, kind, alpha, beta, a, b, lo )

%*****************************************************************************80
%
%% CLIQF computes a classical quadrature formula, with optional printing.
%
%  Discussion:
%
%    This routine computes all the weights of an interpolatory
%    quadrature formula with
%    1. only simple knots and
%    2. a classical weight function with any valid A and B, and
%    3. optionally prints the knots and weights and a check of the moments.
%
%    To evaluate this quadrature formula for a given function F,
%    call routine EIQFS.
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
%    Input, integer LO, indicates what is to be done.
%    > 0, compute and print weights and moments check.
%    = 0, compute weights.
%    < 0, compute and print weights.
%
%    Output, real WTS(NT), the weights.
%
  key = 1;
  mlt = zeros(nt,1);
  mlt(1:nt) = 1;
  ndx = zeros(nt,1);

  wts = ciqf ( nt, t, mlt, nt, ndx, key, kind, alpha, beta, a, b, lo );

  return
end
