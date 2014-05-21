function parchk ( kind, m, alpha, beta )

%*****************************************************************************80
%
%% PARCHK checks parameters ALPHA and BETA for classical weight functions.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    16 February 2010
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
%    Input, integer M, the order of the highest moment to
%    be calculated.  This value is only needed when KIND = 8.
%
%    Input, real ALPHA, BETA, the parameters, if required
%    by the value of KIND.
%
  if ( kind <= 0 )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'PARCHK - Fatal error!\n' );
    fprintf ( 1, '  KIND <= 0.\n' );
    error ( 'PARCHK - Fatal error!' );
  end
%
%  Check ALPHA for Gegenbauer, Jacobi, Laguerre, Hermite, Exponential.
%
  if ( 3 <= kind && kind <= 8 && alpha <= -1.0 )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'PARCHK - Fatal error!\n' );
    fprintf ( 1, '  3 <= KIND and ALPHA <= -1.\n' );
    error ( 'PARCHK - Fatal error!' );
  end
%
%  Check BETA for Jacobi.
%
  if ( kind == 4 && beta <= -1.0 )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'PARCHK - Fatal error!\n' );
    fprintf ( 1, '  KIND == 4 and BETA <= -1.0.\n' );
    error ( 'PARCHK - Fatal error!' );
  end
%
%  Check ALPHA and BETA for rational.
%
  if ( kind == 8 )
    tmp = alpha + beta + m + 1.0;
    if ( 0.0 <= tmp || tmp <= beta )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'PARCHK - Fatal error!\n' );
      fprintf ( 1, '  KIND == 8 but condition on ALPHA and BETA fails.\n' );
      error ( 'PARCHK - Fatal error!' );
    end
  end

  return
end
