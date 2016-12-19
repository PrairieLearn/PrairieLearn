function d = cwiqd ( m, nm, l, v, xk, nstar, phi, a, r )

%*****************************************************************************80
%
%% CWIQD computes all the weights for a given knot.
%
%  Discussion:
%
%    The variable names correspond to the 1982 reference, and explanations of
%    some of the terminology may be found there.
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
%    Jaroslav Kautsky, Sylvan Elhay,
%    Calculation of the Weights of Interpolatory Quadratures,
%    Numerische Mathematik,
%    Volume 40, 1982, pages 407-422.
%
%  Parameters:
%
%    Input, integer M, the multiplicity of the knot in question.
%
%    Input, integer NM, is equal to max ( N - M, 1 ), where N is
%    the number of knots used, counted according to multiplicity.
%
%    Input, integer L, min ( M, N - M + 1), where N is the number
%    of knots used, counted according to multiplicity.
%
%    Input, real V,  the knot in question.
%
%    Input, real XK(NM), all but the last m entries in the
%    diagonal of K-hat.
%
%    Input, integer NSTAR, the dimension of the Jacobi matrix.
%
%    Input, real PHI(NSTAR), the eigenvalues of the Jacobi matrix.
%
%    Input, real A(NSTAR), the square of the first row of the
%    orthogonal matrix that diagonalizes the Jacobi matrix.
%
%    Input, real R(L), used to compute the right principal vectors.
%
%    Output, real D(M), the weights.
%
  wf = zeros ( nstar, 1 );
%
%  Compute products required for Y-hat.
%
  for j = 1 : nstar
    wf(j) = a(j);
    for i = 1 : nm
      wf(j) = wf(j) * ( phi(j) - xk(i) );
    end
  end
%
%  Compute Y-hat.
%
  y = zeros ( m );
  for i = 1 : m
    sum = 0.0;
    for j = 1 : nstar
      sum = sum + wf(j);
      wf(j) = wf(j) * ( phi(j) - v );
    end
    y(i) = sum;
  end
%
%  If N = 1 the right principal vector is already in R.
%  Otherwise compute the R-principal vector of grade M-1.
%
  for i = 1 : nm

    tmp = v - xk(i);

    last = min ( l, i + 1 );
    for jr = 2 : last
      j = last - jr + 2;
      r(j) = tmp * r(j) + r(j-1);
    end

    r(1) = tmp * r(1);

  end
%
%  Compute left principal vector(s) and weight for highest derivative.
%  The following statement contains the only division in this
%  routine.  Any test for overflow should be made after it.
%
  d(m) = y(m) / r(1);

  if ( m == 1 )
    return
  end
%
%  Compute left principal vector.
%
  z = zeros ( m );
  z(1) = 1.0 / r(1);
  for i = 2 : m
    sum = 0.0;
    minil = min ( i, l );
    for j = 2 : minil
      k = i - j + 1;
      sum = sum + r(j) * z(k);
    end
    z(i) = - sum * z(1);
  end
%
%  Accumulate weights.
%
  for i = 2 : m
    sum = 0.0;
    for j = 1 : i
      k = m - i + j;
      sum = sum + z(j) * y(k);
    end
    k = m - i + 1;
    d(k) = sum;
  end

  return
end
