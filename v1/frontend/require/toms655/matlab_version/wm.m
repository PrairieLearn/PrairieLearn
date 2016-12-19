function w = wm ( m, kind, alpha, beta )

%*****************************************************************************80
%
%% WM evaluates the first M moments of classical weight functions.
%
%  Discussion:
%
%    W(K) = Integral ( A <= X <= B ) X**(K-1) * W(X) dx
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
%    Input, integer M, the number of moments to evaluate.
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
%    Output, real W(M), the first M moments.
%
  parchk ( kind, m, alpha, beta );

  w(2:2:m) = 0.0;

  if ( kind == 1 )

    for k = 1 : 2 : m
      w(k) = 2.0 / k;
    end

  elseif ( kind == 2 )

    w(1) = pi;
    for k = 3 : 2 : m
      w(k) = w(k-2) * ( k - 2.0 ) / ( k - 1.0 );
    end

  elseif ( kind == 3 )

    w(1) = sqrt ( pi ) * gamma ( alpha + 1.0 ) ...
      / gamma ( alpha + 3.0 / 2.0 );

    for k = 3 : 2 : m
      w(k) = w(k-2) * ( k - 2.0 ) / ( 2.0 * alpha + k );
    end

  elseif ( kind == 4 )

    als = alpha + beta + 1.0;
    w(1) = 2.0^als * gamma ( alpha + 1.0 ) ...
      / gamma ( als + 1.0 ) * gamma ( beta + 1.0 );

    for k = 2 : m

      sum = 0.0;
      trm = 1.0;

      for i = 0 : floor ( k - 2 ) / 2;

        tmpa = trm;
        for ja = 1 : 2 * i
          tmpa = tmpa * ( alpha + ja ) / ( als + ja );
        end

        for jb = 1 : k - 2 * i - 1
          tmpa = tmpa * ( beta + jb ) / ( als + 2 * i + jb );
        end

        tmpa = tmpa / ( 2 * i + 1.0 ) * ...
          ( 2 * i * ( beta + alpha ) + beta - ( k - 1.0 ) * alpha ) ...
          / ( beta + k - 2 * i - 1.0 );
        sum = sum + tmpa;

        trm = trm * ( k - 2 * i - 1.0 ) ...
          / ( 2 * i + 1.0 ) * ( k - 2 * i - 2.0 ) / ( 2 * i + 2.0 );

      end

      if ( mod ( k, 2 ) ~= 0 )
        tmpb = 1.0;
        for i = 1 : k - 1
          tmpb = tmpb * ( alpha + i ) / ( als + i );
        end
        sum = sum + tmpb;
      end

      w(k) = sum * w(1);

    end

  elseif ( kind == 5 )

    w(1) = gamma ( alpha + 1.0 );

    for k = 2 : m
      w(k) = ( alpha + k - 1.0 ) * w(k-1);
    end

  elseif ( kind == 6 )

    w(1) = gamma ( ( alpha + 1.0 ) / 2.0 );

    for k = 3 : 2 : m
      w(k) = w(k-2) * ( alpha + k - 2.0 ) / 2.0;
    end

  elseif ( kind == 7 )

    als = alpha;
    for k = 1 : 2 : m
      w(k) = 2.0 / ( k + als );
    end

  elseif ( kind == 8 )

    w(1) = gamma ( alpha + 1.0 ) ...
      * gamma ( - alpha - beta - 1.0 ) ...
      / gamma ( - beta );

    for k = 2 : m
      w(k) = - w(k-1) * ( alpha + k - 1.0 ) / ( alpha + beta + k );
    end

  elseif ( kind == 9 )

    w(1) = pi / 2.0;
    for k = 3 : 2 : m
      w(k) = w(k-2) * ( k - 2.0 ) / ( k + 1.0 );
    end

  end

  return
end
