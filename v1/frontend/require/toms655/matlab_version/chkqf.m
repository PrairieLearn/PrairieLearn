function [ e, er, qm ] = chkqf ( t, wts, mlt, nt, nwts, ndx, key, mop, mex, ...
  kind, alpha, beta, lo, a, b )

%*****************************************************************************80
%
%% CHKQF computes and prints the moments of a quadrature formula.
%
%  Discussion:
%
%    The quadrature formula is based on a clasical weight function with
%    any valid A, B.
%
%    No check can be made for non-classical weight functions.
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
%    Input, real T(NT), the knots.
%
%    Input, real WTS(NWTS), the weights.
%
%    Input, integer MLT(NT), the multiplicity of the knots.
%
%    Input, integer NT, the number of knots.
%
%    Input, integer NWTS, the number of weights.
%
%    Input, integer NDX(NT), used to index the array WTS.
%    If KEY = 1, then NDX need not be preset.  For more details see the
%    comments in CAWIQ.
%
%    Input, integer KEY, indicates the structure of the WTS
%    array.  It will normally be set to 1.  This will cause the weights to be
%    packed sequentially in array WTS.  For more details see the comments
%    in CAWIQ.
%
%    Input, integer MOP, the expected order of precision of the
%    quadrature formula.
%
%    Input, integer MEX, the number of moments required to be
%    tested.  Set MEX = 1 and LO < 0 for no moments check.
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
%    Input, integer LO, selects the action to carry out.
%     > 0, print weights and moment tests.
%     = 0, print nothing. compute moment test.
%     < 0, print weights only. don't compute moment tests.
%
%    Input, real A, B, the interval endpoints.
%
%    Output, real E(MEX), ER(MEX), the absolute and relative
%    errors of the quadrature formula applied to (x-del)^n.
%
%    Output, real QM(MEX), the value of the quadrature formula
%    applied to integrands like (X-DEL)^N.
%
  parchk ( kind, mex, alpha, beta );

  if ( lo ~= 0 )
    izero = 0;

    fprintf ( 1, '\n' );
    fprintf ( 1, '  Interpolatory quadrature formula\n' );
    fprintf ( 1, '\n' );
    fprintf ( 1, ...
      '  Type  Interval       Weight function               Name\n' );
    fprintf ( 1, '\n' );
    if ( kind == 1 )
      fprintf ( 1, ...
        '    1    (a,b)              1.0                    Legendre\n' );
    elseif ( kind == 2 )
      fprintf ( 1, ...
        '    2    (a,b)      ((b-x)*(x-a))^(-0.5)          Chebyshev Type 1\n' );
    elseif ( kind == 3 )
      fprintf ( 1, ...
        '    3    (a,b)      ((b-x)*(x-a))^alpha           Gegenbauer\n' );
    elseif ( kind == 4 )
      fprintf ( 1, ...
        '    4    (a,b)    (b-x)^alpha*(x-a)^beta          Jacobi\n' );
    elseif ( kind == 5 )
      fprintf ( 1, ...
        '    5   (a,oo)   (x-a)^alpha*exp(-b*(x-a))      Gen Laguerre\n' );
    elseif ( kind == 6 )
      fprintf ( 1, ...
        '    6  (-oo,oo) |x-a|^alpha*exp(-b*(x-a)^2)  Gen Hermite\n' );
    elseif ( kind == 7 )
      fprintf ( 1, ...
        '    7    (a,b)      |x-(a+b)/2.0|^alpha        Exponential\n' );
    elseif ( kind == 8 )
      fprintf ( 1, ...
        '    8   (a,oo)    (x-a)^alpha*(x+b)^beta         Rational\n' );
    elseif ( kind == 9 )
      fprintf ( 1, ...
        '    9    (a,b)      ((b-x)*(x-a))^(+0.5)          Chebyshev Type 2\n' );
    end

    fprintf ( 1, '\n' );
    fprintf ( 1, '     Parameters   A          %d\n', a );
    fprintf ( 1, '                  B          %f\n', b );
    if ( 3 <= kind && kind <= 8 )
      fprintf ( 1, '                  alpha      %f\n', alpha );
    end

    if ( kind == 4 || kind == 8 )
      fprintf ( 1, '                  beta       %f\n', beta );
    end

    w = zeros ( mex );
    [ w, e, er, qm ] = chkqfs ( t, wts, mlt, nt, nwts, ndx, key, mop, mex, ...
      izero, alpha, beta, - abs ( lo ), w  );

    if ( lo < 0 )
      return
    end

  end

  w = scmm ( mex, kind, alpha, beta, a, b );

  if ( kind == 1 || kind == 2 || kind == 3 || kind == 4 || kind == 7 || kind == 9 )
    tmp = ( b + a ) / 2.0;
  elseif ( kind == 5 || kind == 6 || kind == 8 )
    tmp = a;
  end

  t2(1:nt) = t(1:nt) - tmp;

  neg = -1;
%
%  Check moments.
%
  [ w, e, er, qm ] = chkqfs ( t2, wts, mlt, nt, nwts, ndx, key, mop, mex, neg, ...
    alpha, beta, lo, w );

  return
end
