function toms655_test ( )

%*****************************************************************************80
%
%% TOMS655_TEST tests the TOMS655 library.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    15 February 2010
%
%  Author:
%
%    Original FORTRAN77 version by Sylvan Elhay, Jaroslav Kautsky.
%    MATLAB version by John Burkardt.
%
  timestamp ( );
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TOMS655_PRB\n' );
  fprintf ( 1, '  MATLAB version\n' );
  fprintf ( 1, '  Test the TOMS655 library.\n' );

  test01 ( );
  test02 ( );
  test03 ( );
  test04 ( );
  test05 ( );
  test06 ( );
  test07 ( );
  test08 ( );
  test09 ( );
%
%  Compute 15 points of an example of each rule.
%
  for kind = 1 : 9
    nt = 15;
    if ( kind == 8 )
      alpha = 1.0;
      beta = - alpha - 2 * nt - 2;
    else
      alpha = 0.0;
      beta = 0.0;
    end
    test10 ( nt, kind, alpha, beta );
  end
%
%  Compute 15 points of an example of each rule using nondefault A, B.
%
  for kind = 1 : 9

    nt = 15;

    if ( kind == 1 )
      alpha = 0.0;
      beta = 0.0;
      a = 0.0;
      b = 1.0;
    elseif ( kind == 2 )
      alpha = 0.0;
      beta = 0.0;
      a = 0.0;
      b = 1.0;
    elseif ( kind == 3 )
      alpha = 1.0;
      beta = 0.0;
      a = 0.0;
      b = 1.0;
    elseif ( kind == 4 )
      alpha = 1.5;
      beta = 0.5;
      a = 0.0;
      b = 1.0;
    elseif ( kind == 5 )
      alpha = 1.0;
      beta = 0.0;
      a = 1.0;
      b = 1.0;
    elseif ( kind == 6 )
      alpha = 1.0;
      beta = 0.0;
      a = 0.0;
      b = 0.5;
    elseif ( kind == 7 )
      alpha = 1.0;
      beta = 0.0;
      a = 0.0;
      b = 1.0;
    elseif ( kind == 8 )
      alpha = 1.0;
      beta = - alpha - 2 * nt - 2;
      a = 0.0;
      b = 1.0;
    elseif ( kind == 9 )
      alpha = 0.0;
      beta = 0.0;
      a = 0.0;
      b = 1.0;
    end

    test11 ( nt, kind, alpha, beta, a, b );

  end
%
%  Terminate.
%
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TOMS655_PRB\n' );
  fprintf ( 1, '  Normal end of TOMS655 tests.\n' );
  fprintf ( 1, '\n' );
  timestamp ( );

  return
end
function test01 ( )

%*****************************************************************************80
%
%% TEST01 tests CIQFS.
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
  fprintf ( 1, '  ----------------------------------------\n' );
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TEST01\n' );
  fprintf ( 1, '  Test CIQFS.\n' );
%
%  Number of knots.
%
  nt = 5;
%
%  Set the knots in the default interval [-1,+1].
%
  t = zeros ( nt, 1 );
  for i = 1 : nt
    t(i) = cos ( ( 2 * i - 1 ) * pi / 2.0 / nt );
  end
%
%  Set the knot multiplicities.
%
  mlt(1:nt) = 2;
%
%  Set the size of the weights array.
%
  nwts = sum ( mlt(1:nt) );
%
%  Because KEY = 1, NDX will be set up for us.
%
  ndx = zeros(nt,1);
%
%  KEY = 1 indicates that the WTS array should hold the weights
%  in the usual order.
%
  key = 1;
%
%  Request Legendre weight function.
%
  kind = 1;
%
%  ALPHA, BETA not used in Legendre weight function but set anyway.
%
  alpha = 0.0;
  beta  = 0.0;
%
%  LU controls printing.
%  A positive value requests that we compute and print weights, and
%  conduct a moments check.
%
  lu = 6;

  [ wts, ndx ] = ciqfs ( nt, t, mlt, nwts, ndx, key, kind, alpha, beta, lu );

  return
end
function test02 ( )

%*****************************************************************************80
%
%% TEST02 tests CIQFS.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    06 January 2010
%
%  Author:
%
%    Original FORTRAN77 version by Sylvan Elhay, Jaroslav Kautsky.
%    MATLAB version by John Burkardt.
%
  fprintf ( 1, '  ----------------------------------------\n' );
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TEST02\n' );
  fprintf ( 1, '  Test CIQF, CIQFS, CGQF and CGQFS\n' );
  fprintf ( 1, '  with all classical weight functions.\n' );
%
%  Try all weight functions.
%
  for kind = 1 : 9
%
%  Number of knots.
%
    nt = 5;
%
%  Set parameters ALPHA and BETA.
%
    alpha = 0.5;
    if ( kind ~= 8 )
      beta  = 2.0;
    else
      beta = - 16.0;
    end
%
%  Set A and B.
%
    lo = 6;
    a = - 0.5;
    b = 2.0;
%
%  Have CGQF compute the knots and weights.
%
    fprintf ( 1, '\n' );
    fprintf ( 1, '  Knots and weights of Gauss quadrature formula\n' );
    fprintf ( 1, '  computed by CGQF.\n' );
    [ t, wts ] = cgqf ( nt, kind, alpha, beta, lo, a, b );
%
%  Now compute the weights for the same knots by CIQF.
%
%  Set the knot multiplicities.
%
    mlt = zeros(nt,1);
    mlt(1:nt) = 2;
%
%  Set the size of the weights array.
%
    nwts = sum ( mlt(1:nt) );
%
%  Because KEY = 1, NDX will be set up for us.
%
    ndx = zeros(nt,1);
%
%  KEY = 1 indicates that the WTS array should hold the weights
%  in the usual order.
%
    key = 1;
%
%  LU controls printing.
%  A positive value requests that we compute and print weights, and
%  conduct a moments check.
%
    lu = 6;

    fprintf ( 1, '\n' );
    fprintf ( 1, '  Weights of Gauss quadrature formula computed from the\n' );
    fprintf ( 1, '  knots by CIQF.\n' );

    wts = ciqf ( nt, t, mlt, nwts, ndx, key, kind, alpha, beta, a, b, lu );

  end

  return
end
function test03 ( )

%*****************************************************************************80
%
%% TEST03 tests CEIQFS.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    06 January 2010
%
%  Author:
%
%    Original FORTRAN77 version by Sylvan Elhay, Jaroslav Kautsky.
%    MATLAB version by John Burkardt.
%
  fprintf ( 1, '  ----------------------------------------\n' );
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TEST03\n' );
  fprintf ( 1, '  Test CEIQFS.\n' );
%
%  Number of knots.
%
  nt = 5;
%
%  Set the knots in the default interval [-1,+1].
%
  t = zeros ( nt, 1 );

  for i = 1 : nt
    t(i) = cos ( ( 2 * i - 1 ) * pi / 2.0 / nt );
  end
%
%  Set the knot multiplicities.
%
  mlt = zeros ( nt, 1 );
  mlt(1:nt) = 2;
%
%  Set KIND to the Legendre weight function.
%
  kind = 1;
%
%  ALPHA, BETA not used in Legendre weight function but set anyway.
%
  alpha = 0.0;
  beta  = 0.0;
%
%  Call CEIQFS to set up the quadrature formula and evaluate it on F.
%
  qfsum = ceiqfs ( nt, t, mlt, kind, alpha, beta, @f );

  fprintf ( 1, '\n' );
  fprintf ( 1, '  Integral of sin(x) on -1, 1 by Fejer type rule\n' );
  fprintf ( 1, '  with %d points of multiplicity 2.\n', nt );
  fprintf ( 1, '  Quadrature formula: %24.16f\n', qfsum );

  qfsx = cos ( - 1.0 ) - cos ( 1.0 );
  fprintf ( 1, '  Exact value       : %24.16f\n', qfsx );
  fprintf ( 1, '  Error             : %e\n', abs ( qfsum - qfsx ) );

  return
end
function test04 ( )

%*****************************************************************************80
%
%% TEST04 tests CEIQF.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    06 January 2010
%
%  Author:
%
%    Original FORTRAN77 version by Sylvan Elhay, Jaroslav Kautsky.
%    MATLAB version by John Burkardt.
%
  fprintf ( 1, '  ----------------------------------------\n' );
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TEST04\n' );
  fprintf ( 1, '  Test CEIQF.\n' );
%
%  Number of knots.
%
  nt = 5;
%
%  Set the knots in the default interval [-1,+1].
%
  t = zeros ( nt, 1 );

  for i = 1 : nt
    t(i) = cos ( ( 2 * i - 1 ) * pi / 2.0 / nt );
  end
%
%  Set the knot multiplicities.
%
  mlt = zeros ( nt, 1 );
  mlt(1:nt) = 2;
%
%  Set KIND to the Legendre weight function.
%
  kind = 1;
%
%  ALPHA, BETA not used in Legendre weight function but set anyway.
%
  alpha = 0.0;
  beta  = 0.0;
%
%  Set nonstandard interval A, B.
%
  a = - 0.5;
  b = 2.0;
%
%  Shift knots from [-1,1] to [A,B].
%
  for i = 1 : nt
    t(i) = ( ( b - a ) * t(i) + ( a + b ) ) / 2.0;
  end
%
%  Call CEIQF to set up the quadrature formula and evaluate it on F.
%
  qfsum = ceiqf ( nt, t, mlt, kind, alpha, beta, a, b, @f );

  fprintf ( 1, '\n' );
  fprintf ( 1, '  Integral of sin(x) from %f to %f by Fejer type rule\n', a, b );
  fprintf ( 1, '  with %d points of multiplicity 2.\n', nt );
  fprintf ( 1, '  Quadrature formula: %24.16f\n', qfsum );

  qfsx = cos ( a ) - cos ( b );
  fprintf ( 1, '  Exact value       : %24.16f\n', qfsx );
  fprintf ( 1, '  Error             : %e\n', abs ( qfsum - qfsx ) );

  return
end
function test05 ( )

%*****************************************************************************80
%
%% TEST05 tests CLIQFS.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    06 January 2010
%
%  Author:
%
%    Original FORTRAN77 version by Sylvan Elhay, Jaroslav Kautsky.
%    MATLAB version by John Burkardt.
%
  fprintf ( 1, '  ----------------------------------------\n' );
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TEST05\n' );
  fprintf ( 1, '  Test CLIQFS.\n' );
%
%  Number of knots.
%
  nt = 5;
%
%  Set the knots in the default interval [-1,+1].
%
  t = zeros(nt,1);

  for i = 1 : nt
    t(i) = cos ( ( 2 * i - 1 ) * pi / ( 2 * nt ) );
  end
%
%  Request Legendre weight function.
%
  kind = 1;
%
%  ALPHA, BETA not used in Legendre weight function but set anyway.
%
  alpha = 0.0;
  beta  = 0.0;
%
%  LU controls printing.
%  A positive value requests that we compute and print weights, and
%  conduct a moments check.
%
  lu = 6;
%
%  This call returns the WTS array.
%
  wts = cliqfs ( nt, t, kind, alpha, beta, lu );

  return
end
function test06 ( )

%*****************************************************************************80
%
%% TEST06 tests CLIQF and EIQFS..
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    06 January 2010
%
%  Author:
%
%    Original FORTRAN77 version by Sylvan Elhay, Jaroslav Kautsky.
%    MATLAB version by John Burkardt.
%
  fprintf ( 1, '  ----------------------------------------\n' );
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TEST06\n' );
  fprintf ( 1, '  Test CLIQF and EIQFS.\n' );
%
%  Number of knots.
%
  nt = 5;
%
%  Set the knots in the default interval [-1,+1].
%
  t = zeros(nt,1);

  for i = 1 : nt
    t(i) = cos ( ( 2 * i - 1 ) * pi / ( 2 * nt ) );
  end
%
%  Set KIND to the Legendre weight function.
%
  kind = 1;
%
%  ALPHA, BETA not used in Legendre weight function but set anyway.
%
  alpha = 0.0;
  beta  = 0.0;
%
%  Set nonstandard interval A, B.
%
  a = - 0.5;
  b = 2.0;
%
%  Shift knots from [-1,1] to [A,B].
%
  for i = 1 : nt
    t(i) = ( ( b - a ) * t(i) + ( a + b ) ) / 2.0;
  end
%
%  LU controls printout.
%
  lu = 6;
%
%  Call CLIQF to set up the quadrature formula.
%
  wts = cliqf ( nt, t, kind, alpha, beta, a, b, lu );
%
%  Call EIQFS to evaluate the quadrature formula.
%
  qfsum = eiqfs ( nt, t, wts, @f );

  fprintf ( 1, '\n' );
  fprintf ( 1, '  Integral of sin(x) from %f to %f\n', a, b );
  fprintf ( 1, '  by Fejer type rule with %d points\n', nt );
  fprintf ( 1, '  of multiplicity 1.\n' );
  fprintf ( 1, '  Quadrature formula: %24.16f\n', qfsum );

  qfsx = cos ( a ) - cos ( b );
  fprintf ( 1, '  Exact value       : %24.16f\n', qfsx );
  fprintf ( 1, '  Error             : %e\n', abs ( qfsum - qfsx ) );

  return
end
function test07 ( )

%*****************************************************************************80
%
%% TEST07 tests CEGQF.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    06 January 2010
%
%  Author:
%
%    Original FORTRAN77 version by Sylvan Elhay, Jaroslav Kautsky.
%    MATLAB version by John Burkardt.
%
  fprintf ( 1, '  ----------------------------------------\n' );
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TEST07\n' );
  fprintf ( 1, '  Test CEGQF.\n' );
%
%  Number of knots.
%
  nt = 12;
%
%  Request exponential weight function.
%
  kind = 7;
%
%  Set ALPHA and BETA.
%
  alpha = 1.0;
  beta  = 0.0;
%
%  Set interval [A,B].
%
  a = - 0.5;
  b = 2.0;
%
%  Call CEGQF to compute and evaluate the Gauss quadrature formula.
%
  qfsum = cegqf ( nt, kind, alpha, beta, a, b, @f );

  fprintf ( 1, '\n' );
  fprintf ( 1, '  Integral of x*sin(x) from %f to %f\n', a, b );
  fprintf ( 1, '  by Gauss-exponential rule with %d points\n', nt );
  fprintf ( 1, '  Quadrature formula: %24.16f\n', qfsum );

  qfsx = ( b - a ) * 0.5 * ( cos ( a ) - cos ( b ) ) ...
    + sin ( b ) + sin ( a ) - 2.0 * sin ( ( a + b ) / 2.0 );

  fprintf ( 1, '  Exact value       : %24.16f\n', qfsx );
  fprintf ( 1, '  Error             : %e\n', abs ( qfsum - qfsx ) );

  return
end
function test08 ( )

%*****************************************************************************80
%
%% TEST08 tests CEGQFS.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    06 January 2010
%
%  Author:
%
%    Original FORTRAN77 version by Sylvan Elhay, Jaroslav Kautsky.
%    MATLAB version by John Burkardt.
%
  fprintf ( 1,'  ----------------------------------------\n' );
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TEST08\n' );
  fprintf ( 1, '  Test CEGQFS.\n' );
%
%  Number of knots.
%
  nt = 12;
%
%  Request exponential weight function.
%
  kind = 7;
%
%  Set ALPHA and BETA.
%
  alpha = 1.0;
  beta  = 0.0;
%
%  Call CEGQFS to compute and evaluate the Gauss quadrature formula.
%
  qfsum = cegqfs ( nt, kind, alpha, beta, @f );

  fprintf ( 1, '\n' );
  fprintf ( 1, '  Integral of x*sin(x) from -1 to +1\n' );
  fprintf ( 1, '  by Gauss-exponential rule with %d points.\n', nt )
  fprintf ( 1, '  Quadrature formula: %24.16f\n', qfsum );

  qfsx = cos ( -1.0 ) - cos ( +1.0 );

  fprintf ( 1, '  Exact value       : %24.16f\n', qfsx );
  fprintf ( 1, '  Error             : %e\n', abs ( qfsum - qfsx ) );

  return
end
function test09 ( )

%*****************************************************************************80
%
%% TEST09 calls CGQFS to compute and print generalized Gauss-Hermite rules.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    10 January 2010
%
%  Author:
%
%    John Burkardt
%
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TEST09\n' );
  fprintf ( 1, '  Call CGQFS for a generalized Gauss Hermite rule.\n' );

  nt = 15;
  kind = 6;
  alpha = 1.0;
  beta = 0.0;
  io = - 6;

  fprintf ( 1, '\n' );
  fprintf ( 1, '  NT = %d\n', nt );
  fprintf ( 1, '  ALPHA = %f\n', alpha );

  [ t, wts ] = cgqfs ( nt, kind, alpha, beta, io );

  return
end
function test10 ( nt, kind, alpha, beta )

%*****************************************************************************80
%
%% TEST10 calls CDGQF to compute a quadrature formula.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    06 January 2010
%
%  Author:
%
%    John Burkardt
%
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TEST10\n' );
  fprintf ( 1, '  Call CDGQF to compute a quadrature formula.\n' );
  fprintf ( 1, '\n' );
  fprintf ( 1, '  KIND = %d\n', kind );
  fprintf ( 1, '  ALPHA = %f\n', alpha );
  fprintf ( 1, '  BETA  = %f\n', beta );

  [ t, wts ] = cdgqf ( nt, kind, alpha, beta );

  fprintf ( 1, '\n' );
  fprintf ( 1, ' Index     Abscissas                 Weights\n' );
  fprintf ( 1, '\n' );
  for i = 1 : nt
    fprintf ( 1, '  %4d  %24.16e  %24.16e\n', i, t(i), wts(i) );
  end

  return
end
function test11 ( nt, kind, alpha, beta, a, b )

%*****************************************************************************80
%
%% TEST11 calls CGQF to compute a quadrature formula.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    15 February 2010
%
%  Author:
%
%    John Burkardt
%
  fprintf ( 1, '\n' );
  fprintf ( 1, 'TEST11\n' );
  fprintf ( 1, '  Call CGQF to compute a quadrature formula\n' );
  fprintf ( 1, '  with nondefault values of A and B.\n' );
  fprintf ( 1, '\n' );
  fprintf ( 1, '  KIND = %d\n', kind );
  fprintf ( 1, '  ALPHA = %f\n', alpha );
  fprintf ( 1, '  BETA  = %f\n', beta );
  fprintf ( 1, '  A     = %f\n', a );
  fprintf ( 1, '  B     = %f\n', b );

  lo = 0;
  [ t, wts ] = cgqf ( nt, kind, alpha, beta, lo, a, b );

  fprintf ( 1, '\n' );
  fprintf ( 1, ' Index     Abscissas                 Weights\n' );
  fprintf ( 1, '\n' );
  for i = 1 : nt
    fprintf ( 1, '  %4d  %24.16e  %24.16e\n', i, t(i), wts(i) );
  end

  return
end
function value = f ( x, i )

%*****************************************************************************80
%
%% F returns values of the integrand or its derivatives.
%
%  Discussion:
%
%    This function is an example of an integrand function.
%
%    The package can generate quadrature formulas that use derivative 
%    information as well as function values.  Therefore, this routine is
%    set up to provide derivatives of any order as well as the function
%    value.  In an actual application, the highest derivative needed
%    is of order one less than the highest knot multiplicity.
%
%    In other words, in the usual case where knots are not repeated,
%    this routine only needs to return function values, not any derivatives.
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
%  Parameters:
%
%    Input, real X, the evaluation point.
%
%    Input, integer I, the order of the derivative of F to
%    be evaluated.
%
%    Output, real VALUE, the value of the I-th derivative of F at X.
%
  l = mod ( i, 4 );

  if ( l == 0 )
    value = sin ( x );
  elseif ( l == 1 )
    value = cos ( x );
  elseif ( l == 2 )
    value = - sin ( x );
  elseif ( l == 3 )
    value = - cos ( x );
  end

  return
end
