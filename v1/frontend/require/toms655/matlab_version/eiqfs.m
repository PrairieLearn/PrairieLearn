function qfsum = eiqfs ( nt, t, wts, f )

%*****************************************************************************80
%
%% EIQFS evaluates a quadrature formula defined by CLIQF or CLIQFS.
%
%  Discussion:
%
%    This routine evaluates an interpolatory quadrature formula with all knots
%    simple and all knots included in the quadrature.  This routine will be used
%    typically after CLIQF or CLIQFS has been called.
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
%    Input, real WTS(NT), the weights.
%
%    Input, function F, the name of a routine which
%    evaluates the function and some of its derivatives.  The routine
%    must have the form
%      function value = f ( x, i )
%    and return in VALUE the value of the I-th derivative of the function
%    at X.  The value of I will always be 0.  The value X will always be a knot.
%
%    Output, real QFSUM, the value of the quadrature formula
%    applied to F.
%
  qfsum = 0.0;
  for j = 1 : nt
    qfsum = qfsum + wts(j) * f ( t(j), 0 );
  end

  return
end
