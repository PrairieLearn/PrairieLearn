function w = scmm ( m, kind, alpha, beta, a, b )

%*****************************************************************************80
%
%% SCMM computes moments of a classical weight function scaled to [A,B].
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
%    Input, integer M, the number of moments.
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
%    Output, real W(M), the scaled moments.
%
  temp = eps;

  if ( kind == 1 )

    al = 0.0;
    be = 0.0;

    if ( ( b - a ) <= temp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCMM - Fatal error!\n' );
      fprintf ( 1, '  B - A too small!\n' );
      error ( 'SCMM - Fatal error!' );
    end

    q = ( b - a ) / 2.0;
    p = q^( al + be + 1.0 );

  elseif ( kind == 2 )

    al = -0.5;
    be = -0.5;

    if ( ( b - a ) <= temp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCMM - Fatal error!\n' );
      fprintf ( 1, '  B - A too small!\n' );
      error ( 'SCMM - Fatal error!' );
    end

    q = ( b - a ) / 2.0;
    p = q^( al + be + 1.0 );

  elseif ( kind == 3 )

    al = alpha;
    be = alpha;

    if ( ( b - a ) <= temp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCMM - Fatal error!\n' );
      fprintf ( 1, '  B - A too small!\n' );
      error ( 'SCMM - Fatal error!' );
    end

    q = ( b - a ) / 2.0;
    p = q^( al + be + 1.0 );

  elseif ( kind == 4 )

    al = alpha;
    be = beta;

    if ( ( b - a ) <= temp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCMM - Fatal error!\n' );
      fprintf ( 1, '  B - A too small!\n' );
      error ( 'SCMM - Fatal error!' );
    end

    q = ( b - a ) / 2.0;
    p = q^( al + be + 1.0 );

  elseif ( kind == 5 )

    if ( b <= 0.0 )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCMM - Fatal error!\n' );
      fprintf ( 1, '  B <= 0!\n' );
      error ( 'SCMM - Fatal error!' );
    end

    q = 1.0 / b;
    p = q^( alpha + 1.0 );

  elseif ( kind == 6 )

    if ( b <= 0.0 )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCMM - Fatal error!\n' );
      fprintf ( 1, '  B <= 0!\n' );
      error ( 'SCMM - Fatal error!' );
    end

    q = 1.0 / sqrt ( b );
    p = q^( alpha + 1.0 );

  elseif ( kind == 7 )

    al = alpha;
    be = 0.0;

    if ( ( b - a ) <= temp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCMM - Fatal error!\n' );
      fprintf ( 1, '  B - A too small!\n' );
      error ( 'SCMM - Fatal error!' );
    end

    q = ( b - a ) / 2.0;
    p = q^( al + be + 1.0 );

  elseif ( kind == 8 )

    if ( a + b <= 0.0 )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCMM - Fatal error!\n' );
      fprintf ( 1, '  A + B <= 0!\n' );
      error ( 'SCMM - Fatal error!' );
    end

    q = a + b;
    p = q^( alpha + beta + 1.0 );

  elseif ( kind == 9 )

    if ( ( b - a ) <= temp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCMM - Fatal error!\n' );
      fprintf ( 1, '  B - A too small!\n' );
      error ( 'SCMM - Fatal error!' );
    end

    q = ( b - a ) / 2.0;
    p = q * q;

  end

  w = wm ( m, kind, alpha, beta );

  tmp = p;

  for i = 1 : m
    w(i) = w(i) * tmp;
    tmp = tmp * q;
  end

  return
end
