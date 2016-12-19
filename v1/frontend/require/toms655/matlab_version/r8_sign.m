function value = r8_sign ( x )

%*****************************************************************************80
%
%% R8_SIGN returns the sign of an R8.
%
%  Discussion:
%
%    The value is +1 if the number is positive or zero, and it is -1 otherwise.
%
%  Licensing:
%
%    This code is distributed under the GNU LGPL license.
%
%  Modified:
%
%    21 March 2004
%
%  Author:
%
%    John Burkardt
%
%  Parameters:
%
%    Input, real X, the number whose sign is desired.
%
%    Output, real VALUE, the sign of X.
%
  if ( 0 <= x )
    value = +1.0;
  else
    value = -1.0;
  end

  return
end
