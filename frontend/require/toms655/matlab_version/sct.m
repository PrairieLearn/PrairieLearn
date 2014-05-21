function t = sct ( nt, t, kind, a, b )

%*****************************************************************************80
%
%% SCT rescales distinct knots to an interval [A,B].
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
%    Input, integer NT, the number of knots.
%
%    Input, real T(NT), the original knots.
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
%    Input, real A, B, the interval endpoints for which the
%    knots ST should be scaled.
%
%    Output, real T(NT), the scaled knots.
%
  if ( kind < 1 || 9 < kind )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'SCT - Fatal error!\n' );
    fprintf ( 1, '  KIND falls outside range of 1 to 8.\n' );
    error ( 'SCT - Fatal error!' );
  end

  if ( kind == 1 || kind == 2 || kind == 3 || kind == 4 || kind == 7 || kind == 9)

    tmp = eps;
    bma = b - a;

    if ( bma <= tmp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCT - Fatal error!\n' );
      fprintf ( 1, '  B - A too small.\n' );
      error ( 'SCT - Fatal error!' );
    end

    slp = 2.0 / bma;
    shft = - ( a + b ) / bma;

  elseif ( kind == 5 )

    if ( b < 0.0 )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCT - Fatal error!\n' );
      fprintf ( 1, '  B < 0.\n' );
      error ( 'SCT - Fatal error!' );
    end

    slp = b;
    shft = - a * b;

  elseif ( kind == 6 )

    if ( b < 0.0 )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCT - Fatal error!\n' );
      fprintf ( 1, '  B < 0.\n' );
      error ( 'SCT - Fatal error!' );
    end

    slp = sqrt ( b );
    shft = - a * slp;

  elseif ( kind == 8 )

    slp = 1.0 / ( a + b );

    if ( slp <= 0.0 )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCT - Fatal error!\n' );
      fprintf ( 1, '  1 / ( A + B ) <= 0.\n' );
      error ( 'SCT - Fatal error!' );
    end

    shft = - a * slp;

  end

  t(1:nt) = shft + slp * t(1:nt);

  return
end
