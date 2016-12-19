function w = wtfn ( t, nt, kind, alpha, beta )

%*****************************************************************************80
%
%% WTFN evaluates the classical weight functions at given points.
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
%    Input, real T(NT), the points where the weight function
%    is to be evaluated.
%
%    Input, integer NT, the number of evaluation points.
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
%    Output, real W(NT), the value of the weight function.
%
  parchk ( kind, 1, alpha, beta );

  if ( kind == 1 )

    w(1:nt) = 1.0;

  elseif ( kind == 2 )

    w(1:nt) = 1.0 ./ sqrt ( ( 1.0 - t(1:nt) ) .* ( 1.0 + t(1:nt) ) );

  elseif ( kind == 3 )

    if ( alpha == 0.0 )
      w(1:nt) = 1.0;
    else
      w(1:nt) = ( ( 1.0 - t(1:nt) ) .* ( 1.0 + t(1:nt) ) ).^alpha;
    end

  elseif ( kind == 4 )

    if ( alpha == 0.0 )
      w(1:nt) = 1.0;
    else
      w(1:nt) = ( 1.0 - t(1:nt) ).^alpha;
    end

    if ( beta ~= 0.0 )
      w(1:nt) = w(1:nt) * ( 1.0 + t(1:nt) ).^beta;
    end

  elseif ( kind == 5 )

    if ( alpha == 0.0 )
      w(1:nt) = exp ( - t(1:nt) );
    else
      w(1:nt) = exp ( - t(1:nt) ) .* t(1:nt).^alpha;
    end

  elseif ( kind == 6 )

    if ( alpha == 0.0 )
      w(1:nt) = exp ( - t(1:nt).^2 );
    else
      w(1:nt) = exp ( - t(1:nt)^2 ) .* abs ( t(1:nt) ).^alpha;
    end

  elseif ( kind == 7 )

    if ( alpha ~= 0.0 )
      w(1:nt) = abs ( t(1:nt) ).^alpha;
    else
      w(1:nt) = 1.0;
    end

  elseif ( kind == 8 )

    if ( alpha == 0.0 )
      w(1:nt) = 1.0;
    else
      w(1:nt) = t(1:nt).^alpha;
    end

    if ( beta ~= 0.0 )
      w(1:nt) = w(1:nt) * ( 1.0 + t(1:nt) ).^beta;
    end

  elseif ( kind == 9 )

    w(1:nt) = sqrt ( ( 1.0 - t(1:nt) ) .* ( 1.0 + t(1:nt) ) );

  end

  return
end
