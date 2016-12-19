function [ t, wts ] = scqf ( nt, t, mlt, wts, nwts, ndx, kind, alpha, ...
  beta, a, b )

%*****************************************************************************80
%
%% SCQF scales a quadrature formula to a nonstandard interval.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    24 February 2010
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
%    Input, integer MLT(NT), the multiplicity of the knots.
%
%    Input, real WTS(NWTS), the weights.
%
%    Input, integer NWTS, the number of weights.
%
%    Input, integer NDX(NT), used to index the array WTS.
%    For more details see the comments in CAWIQ.
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
%    Output, real T(NT), the scaled knots.
%
%    Output, real WTS(NWTS), the scaled weights.
%
  temp = eps;

  parchk ( kind, 1, alpha, beta )

  if ( kind == 1 )

    al = 0.0;
    be = 0.0;

    if ( abs ( b - a ) <= temp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCQF - Fatal error!\n' );
      fprintf ( 1, '  |B - A| too small.\n' );
      fprintf ( 1, '  A = %f\n', a );
      fprintf ( 1, '  B = %f\n', b );
      error ( 'SCQF - Fatal error!' );
    end

    shft = ( a + b ) / 2.0;
    slp = ( b - a ) / 2.0;

  elseif ( kind == 2 )

    al = -0.5;
    be = -0.5;

    if ( abs ( b - a ) <= temp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCQF - Fatal error!\n' );
      fprintf ( 1, '  |B - A| too small.\n' );
      fprintf ( 1, '  A = %f\n', a );
      fprintf ( 1, '  B = %f\n', b );
      error ( 'SCQF - Fatal error!' );
    end

    shft = ( a + b ) / 2.0;
    slp = ( b - a ) / 2.0;

  elseif ( kind == 3 )

    al = alpha;
    be = alpha;

    if ( abs ( b - a ) <= temp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCQF - Fatal error!\n' );
      fprintf ( 1, '  |B - A| too small.\n' );
      fprintf ( 1, '  A = %f\n', a );
      fprintf ( 1, '  B = %f\n', b );
      error ( 'SCQF - Fatal error!' );
    end

    shft = ( a + b ) / 2.0;
    slp = ( b - a ) / 2.0;

  elseif ( kind == 4 )

    al = alpha;
    be = beta;

    if ( abs ( b - a ) <= temp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCQF - Fatal error!\n' );
      fprintf ( 1, '  |B - A| too small.\n' );
      fprintf ( 1, '  A = %f\n', a );
      fprintf ( 1, '  B = %f\n', b );
      error ( 'SCQF - Fatal error!' );
    end

    shft = ( a + b ) / 2.0;
    slp = ( b - a ) / 2.0;

  elseif ( kind == 5 )

    if ( b <= 0.0 )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCQF - Fatal error!\n' );
      fprintf ( 1, '  B <= 0.\n' );
      fprintf ( 1, '  A = %f\n', a );
      fprintf ( 1, '  B = %f\n', b );
      error ( 'SCQF - Fatal error!' );
    end

    shft = a;
    slp = 1.0 / b;
    al = alpha;
    be = 0.0;

  elseif ( kind == 6 )

    if ( b <= 0.0 )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCQF - Fatal error!\n' );
      fprintf ( 1, '  B <= 0.\n' );
      fprintf ( 1, '  A = %f\n', a );
      fprintf ( 1, '  B = %f\n', b );
      error ( 'SCQF - Fatal error!' );
    end

    shft = a;
    slp = 1.0 / sqrt ( b );
    al = alpha;
    be = 0.0;

  elseif ( kind == 7 )

    al = alpha;
    be = 0.0;

    if ( abs ( b - a ) <= temp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCQF - Fatal error!\n' );
      fprintf ( 1, '  |B - A| too small.\n' );
      fprintf ( 1, '  A = %f\n', a );
      fprintf ( 1, '  B = %f\n', b );
      error ( 'SCQF - Fatal error!' );
    end

    shft = ( a + b ) / 2.0;
    slp = ( b - a ) / 2.0;

  elseif ( kind == 8 )

    if ( a + b <= 0.0 )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCQF - Fatal error!\n' );
      fprintf ( 1, '  A + B <= 0.\n' );
      fprintf ( 1, '  A = %f\n', a );
      fprintf ( 1, '  B = %f\n', b );
      error ( 'SCQF - Fatal error!' );
    end

    shft = a;
    slp = a + b;
    al = alpha;
    be = beta;

  elseif ( kind == 9 )

    al = 0.5;
    be = 0.5;

    if ( abs ( b - a ) <= temp )
      fprintf ( 1, '\n' );
      fprintf ( 1, 'SCQF - Fatal error!\n' );
      fprintf ( 1, '  |B - A| too small.\n' );
      fprintf ( 1, '  A = %f\n', a );
      fprintf ( 1, '  B = %f\n', b );
      error ( 'SCQF - Fatal error!' );
    end

    shft = ( a + b ) / 2.0;
    slp = ( b - a ) / 2.0;

  end

  p = slp^( al + be + 1.0 );

  for k = 1 : nt

    t(k) = shft + slp * t(k);
    l = abs ( ndx(k) );

    if ( l ~= 0 )
      tmp = p;
      for i = l : l + mlt(k) - 1
        wts(i) = wts(i) * tmp;
        tmp = tmp * slp;
      end
    end

  end

  return
end
