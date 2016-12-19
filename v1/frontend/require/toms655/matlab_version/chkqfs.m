function [ w, e, er, qm ] = chkqfs ( t, wts, mlt, nt, nwts, ndx, key, mop, ...
  mex, kind, alpha, beta, lo, w )

%*****************************************************************************80
%
%% CHKQFS checks the polynomial accuracy of a quadrature formula.
%
%  Discussion:
%
%    This routine will optionally print weights, and results of a moments test.
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
%    Input, integer MEX, the number of moments to be tested.
%    MEX must be at least 1.  Set MEX = 1 and LO < 0 for no moment check.
%
%    Input, integer KIND, the rule.
%    0, unknown weight function (the user must set the first MEX moments in
%       array W in this case.)
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
%    Input, real W(MEX), the moments array.  This is input
%    only if KIND = 0.
%
%    Output, real W(MEX), the moments array.
%
%    Output, real E(MEX), ER(MEX), the absolute and relative
%    errors of the quadrature formula applied to (x-del)^n.
%
%    Output, real QM(MEX), the values of the quadrature formula
%    applied to (X-DEL)^N.
%

%
%  KIND may be set to -1 to allow printing of moments only.
%
%  This feature is only used internally, by CHKQF.
%
  kindp = max ( 0, kind );

  if ( lo ~= 0 && kind ~= -1 )

    if ( kindp ~= 0 )

      fprintf ( 1, '\n' );
      fprintf ( 1, '  Interpolatory quadrature formula\n' );
      fprintf ( 1, '\n' );
      fprintf ( 1, ...
        '  Type  Interval       Weight function               Name\n' );
      fprintf ( 1, '\n' );
      if ( kindp == 1 )
        fprintf ( 1, ...
          '    1    (-1,+1)            1.0                    Legendre\n' );
      elseif ( kindp == 2 )
        fprintf ( 1, ...
          '    2    (-1,+1)    ((b-x)*(x-a))^(-0.5)          Chebyshev Type 1\n' );
      elseif ( kindp == 3 )
        fprintf ( 1, ...
          '    3    (-1,+1)    ((b-x)*(x-a))^alpha           Gegenbauer\n' );
      elseif ( kindp == 4 )
        fprintf ( 1, ...
          '    4    (-1,+1)  (b-x)^alpha*(x-a)^beta          Jacobi\n' );
      elseif ( kindp == 5 )
        fprintf ( 1, ...
          '    5   (0,oo)   (x-a)^alpha*exp(-b*(x-a))      Gen Laguerre\n' );
      elseif ( kindp == 6 )
        fprintf ( 1, ...
          '    6  (-oo,oo) |x-a|^alpha*exp(-b*(x-a)^2)  Gen Hermite\n' );
      elseif ( kindp == 7 )
        fprintf ( 1, ...
          '    7    (-1,+1)    |x-(a+b)/2.0|^alpha        Exponential\n' );
      elseif ( kindp == 8 )
        fprintf ( 1, ...
          '    8   (0,oo)    (x-a)^alpha*(x+b)^beta         Rational\n' );
      elseif ( kindp == 9 )
        fprintf ( 1, ...
          '    9    (-1,+1)    ((b-x)*(x-a))^(+0.5)          Chebyshev Type 2\n' );
      end

      if ( 3 <= kindp && kindp <= 8 )
        fprintf ( 1, '                  alpha      %f\n', alpha );
      end

      if ( kindp == 4 || kindp == 8 )
        fprintf ( 1, '                  beta       %f\n', beta );
      end

    end

    if ( kind ~= -1 )
      prec = eps;
      fprintf ( 1, '\n' );
      fprintf ( 1, '  Machine precision = %e\n', prec );
    end

    fprintf ( 1, '\n' );
    fprintf ( 1, ...
      '           Knots               Mult                Weights\n' );
    fprintf ( 1, '\n' );

    for i = 1 : nt
      k = abs ( ndx(i) );
      if ( k ~= 0 )
        fprintf ( 1, '%4d%26.17g%4d%26.17g\n', i, t(i), mlt(i), wts(k) );
        for j = k + 1 : k + mlt(i) - 1
          fprintf ( 1, '                                  %26.17g\n', wts(j) );
        end
      end
    end

  end

  if ( lo < 0 )
    w = [];
    e = [];
    er = [];
    qm = [];
    return
  end

  if ( kindp ~= 0 )

    w = wm ( mex, kindp, alpha, beta );

  end

  qm(1:mex) = 0.0;
  erest = 0.0;

  for k = 1 : nt

    tmp = 1.0;
    l = abs ( ndx(k) );
    if ( l == 0 )
      continue
    end

    erest = erest + abs ( wts(l) );
    for j = 1 : mex
      qm(j) = qm(j) + tmp * wts(l);
      tmpx = tmp;
      px = 1.0;
      for jl = 2 : min ( mlt(k), mex - j + 1 )
        kjl = j + jl - 1;
        tmpx = tmpx * ( kjl - 1 );
        qm(kjl) = qm(kjl) + tmpx * wts(l+jl-1) / px;
        if ( key <= 0 )
          px = px * jl;
        end
      end
      tmp = tmp * t(k);
    end

  end

  e = zeros ( mex );
  for k = 1 : mex
    e(k) = w(k) - qm(k);
  end

  er = zeros ( mex );
  for k = 1 : mex
    er(k) = e(k) / ( abs ( w(k) ) + 1.0 );
  end
%
%  For some strange weight functions W(1) may vanish.
%
  erest = erest / ( abs ( w(1) ) + 1.0 );
%
%  Exit if user does not want printed output.
%
  if ( lo == 0 )
    return
  end

  m = mop + 1;
  mx = min ( mop, mex );

  emx = max ( abs ( e(1:mx) ) );
  emn = min ( abs ( e(1:mx) ) );
  erx = max ( abs ( er(1:mx) ) );
  ern = min ( abs ( er(1:mx) ) );

  fprintf ( 1, '\n' );
  fprintf ( 1, '  Comparison of moments\n' );
  fprintf ( 1, '\n' );
  fprintf ( 1, '  Order of precision %d\n', mop );
  fprintf ( 1, '  Errors :    Absolute    Relative\n' );
  fprintf ( 1, '  ---------+-------------------------\n' );
  fprintf ( 1, '  Minimum :%12.3g%12.3g\n', emn, ern );
  fprintf ( 1, '  Maximum :%12.3g%12.3g\n', emx, erx );
  fprintf ( 1, '\n' );
  fprintf ( 1, '  Weights ratio       %13.3g\n', erest );

  if ( m <= mex )

    ek = e(m);
    for j = 1 : mop
      ek = ek / j;
    end

    fprintf ( 1, '  Error in %2dth power %13.3g\n', mop, e(m) );
    fprintf ( 1, '  Error constant      %13.3g\n', ek );

  end

  fprintf ( 1, '\n' );
  fprintf ( 1, '  Moments:\n' );
  fprintf ( 1, '\n' );
  fprintf ( 1, ...
    '            True             from QF            Error      Relative\n' );
  fprintf ( 1, '\n' );
  for j = 1 : mx
    fprintf ( 1, '%4d%19.10g%19.10g%12.3g%12.3g\n', ...
      j, w(j), qm(j), e(j), er(j) );
  end
  fprintf ( 1, '\n' );
  for j = m : mex
    fprintf ( 1, '%4d%19.10g%19.10g%12.3g%12.3g\n', ...
      j, w(j), qm(j), e(j), er(j) );
  end

  return
end
