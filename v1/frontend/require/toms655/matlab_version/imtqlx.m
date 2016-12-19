function [ d, z ] = imtqlx ( n, d, e, z )

%*****************************************************************************80
%
%% IMTQLX diagonalizes a symmetric tridiagonal matrix.
%
%  Discussion:
%
%    This routine is a slightly modified version of the EISPACK routine to
%    perform the implicit QL algorithm on a symmetric tridiagonal matrix.
%
%    The authors thank the authors of EISPACK for permission to use this
%    routine.
%
%    It has been modified to produce the product Q' * Z, where Z is an input
%    vector and Q is the orthogonal matrix diagonalizing the input matrix.
%    The changes consist (essentially) of applying the orthogonal transformations
%    directly to Z as they are generated.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    04 January 2010
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
%    Roger Martin, James Wilkinson,
%    The Implicit QL Algorithm,
%    Numerische Mathematik,
%    Volume 12, Number 5, December 1968, pages 377-383.
%
%  Parameters:
%
%    Input, integer N, the order of the matrix.
%
%    Input, real D(N), the diagonal entries of the matrix.
%
%    Input, real E(N), the subdiagonal entries of the
%    matrix, in entries E(1) through E(N-1). 
%
%    Input, real Z(N), a vector to be operated on.
%
%    Output, real D(N), the diagonal entries of the diagonalized matrix.
%
%    Output, real Z(N), the value of Q' * Z, where Q is the matrix that 
%    diagonalizes the input symmetric tridiagonal matrix.
%
  itn = 30;

  prec = eps;

  if ( n == 1 )
    return
  end

  e(n) = 0.0;

  for l = 1 : n

    j = 0;

    while ( 1 )

      for m = l : n

        if ( m == n )
          break
        end

        if ( abs ( e(m) ) <= prec * ( abs ( d(m) ) + abs ( d(m+1) ) ) )
          break
        end

      end

      p = d(l);

      if ( m == l )
        break
      end

      if ( j == itn )
        fprintf ( 1, '\n' );
        fprintf ( 1, 'IMTQLX - Fatal error!\n' );
        fprintf ( 1, '  Iteration limit exceeded.\n' );
        error ( 'IMTQLX - Fatal error!' );
      end

      j = j + 1;
      g = ( d(l+1) - p ) / ( 2.0 * e(l) );
      r =  sqrt ( g * g + 1.0 );
      g = d(m) - p + e(l) / ( g + r8_sign ( g ) * abs ( r ) );
      s = 1.0;
      c = 1.0;
      p = 0.0;
      mml = m - l;

      for ii = 1 : mml

        i = m - ii;
        f = s * e(i);
        b = c * e(i);

        if ( abs ( f ) >= abs ( g ) )
          c = g / f;
          r =  sqrt ( c * c + 1.0 );
          e(i+1) = f * r;
          s = 1.0 / r;
          c = c * s;
        else
          s = f / g;
          r =  sqrt ( s * s + 1.0 );
          e(i+1) = g * r;
          c = 1.0 / r;
          s = s * c;
        end

        g = d(i+1) - p;
        r = ( d(i) - g ) * s + 2.0 * c * b;
        p = s * r;
        d(i+1) = g + p;
        g = c * r - b;
        f = z(i+1);
        z(i+1) = s * z(i) + c * f;
        z(i) = c * z(i) - s * f;

      end

      d(l) = d(l) - p;
      e(l) = g;
      e(m) = 0.0;

    end

  end

  for ii = 2 : n

     i = ii - 1;
     k = i;
     p = d(i);

     for j = ii : n
       if ( d(j) < p )
         k = j;
         p = d(j);
       end
     end

     if ( k ~= i )
       d(k) = d(i);
       d(i) = p;
       p = z(i);
       z(i) = z(k);
       z(k) = p;
     end

  end

  return
end
