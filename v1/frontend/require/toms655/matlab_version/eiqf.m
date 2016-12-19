function qfsum = eiqf ( nt, t, mlt, wts, nwts, ndx, key, f )

%*****************************************************************************80
%
%% EIQF evaluates an interpolatory quadrature formula.
%
%  Discussion:
%
%   The knots, weights and integrand are supplied.
%
%   All knots with nonzero NDX are used.
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
%    Input, integer MLT(NT), the multiplicity of the knots.
%
%    Input, real WTS(NWTS), the weights.
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
%    Input, function F, the name of a routine which
%    evaluates the function and some of its derivatives.  The routine
%    must have the form
%      function value = f ( x, i )
%    and return in VALUE the value of the I-th derivative of the function
%    at X.  The highest value of I will be the maximum value in MLT minus
%    one.  The value X will always be a knot.
%
%    Output, real QFSUM, the value of the quadrature formula
%    applied to F.
%
  l = abs ( key );

  if ( l < 1 || 4 < l )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'EIQF - Fatal error!\n' );
    fprintf ( 1, '  Magnitude of KEY must be between 1 and 4.\n' );
    error ( 'EIQF - Fatal error!' );
  end

  qfsum = 0.0;
  for j = 1 : nt
    l = abs ( ndx(j) );
    if ( l ~= 0 )
      p = 1.0;
      for i = 1 : mlt(j)
        qfsum = qfsum + wts(l+i-1) * f ( t(j), i - 1 ) / p;
        if ( key <= 0 )
          p = p * i;
        end
      end
    end
  end

  return
end
