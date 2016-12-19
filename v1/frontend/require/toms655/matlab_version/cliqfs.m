function wts = cliqfs ( nt, t, kind, alpha, beta, lo )

%*****************************************************************************80
%
%% CLIQFS computes the weights of a quadrature formula in the default interval.
%
%  Discussion:
%
%    This routine computes the weights of an interpolatory quadrature formula
%    with a classical weight function, in the default interval A, B,
%    using only simple knots.
%
%    It can optionally print knots and weights and a check of the moments.
%
%    To evaluate a quadrature computed by CLIQFS, call EIQFS.
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
%    Input, integer LO, chooses the printing option.
%     > 0, compute weights, print them, print the moment check results.
%     0, compute weights.
%     < 0, compute weights and print them.
%
%    Output, real WTS(NT), the weights.
%
  key = 1;

  mlt = zeros(nt,1);
  mlt(1:nt) = 1;

  ndx = zeros(nt,1);

  wts = ciqfs ( nt, t, mlt, nt, ndx, key, kind, alpha, beta, lo );

  return
end
