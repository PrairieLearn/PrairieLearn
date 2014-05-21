function value = i4_sign ( i )

%*****************************************************************************80
%
%% I4_SIGN returns the sign of an integer.
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
%    11 June 2005
%
%  Author:
%
%    John Burkardt
%
%  Parameters:
%
%    Input, integer I, the number whose sign is desired.
%
%    Output, integer VALUE, the sign of I.
%
  if ( 0 <= i )
    value = +1;
  else
    value = -1;
  end

  return
end
