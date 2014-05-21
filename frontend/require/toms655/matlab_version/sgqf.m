function [ t, wts ] = sgqf ( nt, aj, bj, zemu )

%*****************************************************************************80
%
%% SGQF computes knots and weights of a Gauss Quadrature formula.
%
%  Discussion:
%
%    This routine computes all the knots and weights of a Gauss quadrature
%    formula with simple knots from the Jacobi matrix and the zero-th
%    moment of the weight function, using the Golub-Welsch technique.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    12 February 2010
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
%    Input, real AJ(NT), the diagonal of the Jacobi matrix.
%
%    Input, real BJ(NT), the subdiagonal of the Jacobi
%    matrix, in entries 1 through NT-1.  On output, BJ has been overwritten.
%
%    Input, real ZEMU, the zero-th moment of the weight function.
%
%    Output, real T(NT), the knots.
%
%    Output, real WTS(NT), the weights.
%

%
%  Exit if the zero-th moment is not positive.
%
  if ( zemu <= 0.0 )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'SGQF - Fatal error!\n' );
    fprintf ( 1, '  ZEMU <= 0.\n' );
    error ( 'SGQF - Fatal error!' );
  end
%
%  Set up vectors for IMTQLX.
%
  wts = zeros ( nt, 1 );

  wts(1) = sqrt ( zemu );
  wts(2:nt) = 0.0;
%
%  Diagonalize the Jacobi matrix.
%
  [ t, wts ] = imtqlx ( nt, aj, bj, wts );

  wts(1:nt) = wts(1:nt).^2;

  return
end
