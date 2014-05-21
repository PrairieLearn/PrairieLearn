function [ aj, bj, zemu ] = class_matrix ( kind, m, alpha, beta )

%*****************************************************************************80
%
%% CLASS_MATRIX computes the Jacobi matrix for a quadrature rule.
%
%  Discussion:
%
%    This routine computes the diagonal AJ and subdiagonal BJ
%    elements of the order M tridiagonal symmetric Jacobi matrix
%    associated with the polynomials orthogonal with respect to
%    the weight function specified by KIND.
%
%    For weight functions 1-7, M elements are defined in BJ even
%    though only M-1 are needed.  For weight function 8, BJ(M) is
%    set to zero.
%
%    The zero-th moment of the weight function is returned in ZEMU.
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
%    Input, integer M, the order of the Jacobi matrix.
%
%    Input, real ALPHA, the value of Alpha, if needed.
%
%    Input, real BETA, the value of Beta, if needed.
%
%    Output, real AJ(M), BJ(M), the diagonal and subdiagonal
%    of the Jacobi matrix.
%
%    Output, real ZEMU, the zero-th moment.
%
  temp = eps;

  parchk ( kind, 2 * m - 1, alpha, beta );

  temp2 = 0.5;

  if ( 500.0 * temp < abs ( ( gamma ( temp2 ) )^2 - pi ) )
    fprintf ( 1, '\n' );
    fprintf ( 1, 'CLASS - Fatal error!\n' );
    fprintf ( 1, '  Gamma function does not match machine parameters.\n' );
    error ( 'CLASS - Fatal error!' );
  end

  bj = zeros(m,1);
  aj = zeros(m,1);

  if ( kind == 1 )

    ab = 0.0;

    zemu = 2.0 / ( ab + 1.0 );

    aj(1:m) = 0.0;

    for i = 1 : m
      abi = i + ab * mod ( i, 2 );
      abj = 2 * i + ab;
      bj(i) = abi * abi / ( abj * abj - 1.0 );
    end
    bj(1:m) =  sqrt ( bj(1:m) );

  elseif ( kind == 2 )

    zemu = pi;

    aj(1:m) = 0.0;

    bj(1) =  sqrt ( 0.5 );
    bj(2:m) = 0.5;

  elseif ( kind == 3 )

    ab = alpha * 2.0;
    zemu = 2.0^( ab + 1.0 ) * gamma ( alpha + 1.0 )^2 ...
      / gamma ( ab + 2.0 );

    aj(1:m) = 0.0;
    bj(1) = 1.0 / ( 2.0 * alpha + 3.0 );
    for i = 2 : m
      bj(i) = i * ( i + ab ) / ( 4.0 * ( i + alpha )^2 - 1.0 );
    end
    bj(1:m) =  sqrt ( bj(1:m) );

  elseif ( kind == 4 )

    ab = alpha + beta;
    abi = 2.0 + ab;
    zemu = 2.0^( ab + 1.0 ) * gamma ( alpha + 1.0 ) ...
      * gamma ( beta + 1.0 ) / gamma ( abi );
    aj(1) = ( beta - alpha ) / abi;
    bj(1) = 4.0 * ( 1.0 + alpha ) * ( 1.0 + beta ) ...
      / ( ( abi + 1.0 ) * abi * abi );
    a2b2 = beta * beta - alpha * alpha;

    for i = 2 : m
      abi = 2.0 * i + ab;
      aj(i) = a2b2 / ( ( abi - 2.0 ) * abi );
      abi = abi^2;
      bj(i) = 4.0 * i * ( i + alpha ) * ( i + beta ) * ( i + ab ) ...
        / ( ( abi - 1.0 ) * abi );
    end
    bj(1:m) =  sqrt ( bj(1:m) );

  elseif ( kind == 5 )

    zemu = gamma ( alpha + 1.0 );

    for i = 1 : m
      aj(i) = 2.0 * i - 1.0 + alpha;
      bj(i) = i * ( i + alpha );
    end
    bj(1:m) =  sqrt ( bj(1:m) );

  elseif ( kind == 6 )

    zemu = gamma ( ( alpha + 1.0 ) / 2.0 );

    aj(1:m) = 0.0;

    for i = 1 : m
      bj(i) = ( i + alpha * mod ( i, 2 ) ) / 2.0;
    end
    bj(1:m) =  sqrt ( bj(1:m) );

  elseif ( kind == 7 )

    ab = alpha;
    zemu = 2.0 / ( ab + 1.0 );

    aj(1:m) = 0.0;

    for i = 1 : m
      abi = i + ab * mod(i,2);
      abj = 2 * i + ab;
      bj(i) = abi * abi / ( abj * abj - 1.0 );
    end
    bj(1:m) =  sqrt ( bj(1:m) );

  elseif ( kind == 8 )

    ab = alpha + beta;
    zemu = gamma ( alpha + 1.0 ) * gamma ( - ( ab + 1.0 ) ) ...
      / gamma ( - beta );
    apone = alpha + 1.0;
    aba = ab * apone;
    aj(1) = - apone / ( ab + 2.0 );
    bj(1) = - aj(1) * ( beta + 1.0 ) / ( ab + 2.0 ) / ( ab + 3.0 );
    for i = 2 : m
      abti = ab + 2.0 * i;
      aj(i) = aba + 2.0 * ( ab + i ) * ( i - 1 );
      aj(i) = - aj(i) / abti / ( abti - 2.0 );
    end

    for i = 2 : m - 1
      abti = ab + 2.0 * i;
      bj(i) = i * ( alpha + i ) / ( abti - 1.0 ) * ( beta + i ) ...
        / ( abti^2 ) * ( ab + i ) / ( abti + 1.0 );
    end

    bj(m) = 0.0;
    bj(1:m) =  sqrt ( bj(1:m) );

  elseif ( kind == 9 )

    zemu = pi /  2.0;

    aj(1:m) = 0.0;

    bj(1:m) = 0.5;

  end

  return
end
