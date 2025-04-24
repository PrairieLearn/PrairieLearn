"""Conversion utilities for numbers to a specified precision and notation.

```python
from prairielearn.to_precision import ...
```
"""

__author__ = "William Rusnack github.com/BebeSparkelSparkel linkedin.com/in/williamrusnack williamrusnack@gmail.com"

import math
from typing import Any, Literal

from typing_extensions import assert_never

Notation = Literal["auto", "sci", "std", "standard", "eng", "engineering", "scientific"]


def to_precision(
    value: Any,
    precision: int,
    notation: Notation = "auto",
    filler: str = "e",
) -> str:
    """Converts a value to the specified notation and precision.

    Parameters:
        value: any type that can be converted to a float
        precision: integer that is greater than zero
        notation: string that specifies the notation to use
        filler: string that is placed between the decimal value and 10s exponent

    The possible notations are:

    - `'auto'` - selects standard notation when `-1000 < value < 1000` else returns scientific notation
    - `'sci'` or `'scientific'` - returns [scientific notation](https://www.mathsisfun.com/numbers/scientific-notation.html)
    - `'eng'` or `'engineering'` - returns [engineering notation](http://www.mathsisfun.com/definitions/engineering-notation.html)
    - `'std'` or `'standard'` - returns [standard notation](http://www.mathsisfun.com/definitions/standard-notation.html)

    Returns:
        string of value with the proper precision and notation
    """
    value = float(value)

    if notation == "auto":
        if -1000 < value < 1000:
            converter = std_notation
        else:
            converter = sci_notation

    elif notation in ("sci", "scientific"):
        converter = sci_notation

    elif notation in ("eng", "engineering"):
        converter = eng_notation

    elif notation in ("std", "standard"):
        converter = std_notation

    else:
        assert_never(notation)

    return converter(value, precision, filler)


def std_notation(value: float, precision: int, _extra: Any = None) -> str:
    """Standard notation (US version).
    <http://www.mathsisfun.com/definitions/standard-notation.html>

    Examples:
        >>> std_notation(5, 2)
        5.0
        >>> std_notation(5.36, 2)
        5.4
        >>> std_notation(5360, 2)
        5400
        >>> std_notation(0.05363, 3)
        0.0536

    Returns:
        string of value with the proper precision

    created by William Rusnack
        github.com/BebeSparkelSparkel
        linkedin.com/in/williamrusnack/
        williamrusnack@gmail.com
    """
    sig_digits, power, is_neg = _number_profile(value, precision)

    return ("-" if is_neg else "") + _place_dot(sig_digits, power)


def sci_notation(value: float, precision: int, filler: str) -> str:
    """Scientific notation.
    <https://www.mathsisfun.com/numbers/scientific-notation.html>

    filler is placed between the decimal value and 10s exponent

    Examples:
        >>> sci_notation(123, 1, 'E')
        1E2
        >>> sci_notation(123, 3, 'E')
        1.23E2
        >>> sci_notation(.126, 2, 'E')
        1.3E-1

    Returns:
        string of value with the proper precision and 10s exponent

    created by William Rusnack
        github.com/BebeSparkelSparkel
        linkedin.com/in/williamrusnack/
        williamrusnack@gmail.com
    """
    is_neg, sig_digits, dot_power, ten_power = _sci_notation(value, precision)

    return (
        ("-" if is_neg else "")
        + _place_dot(sig_digits, dot_power)
        + filler
        + str(ten_power)
    )


def eng_notation(value: float, precision: int, filler: str) -> str:
    """Engineering notation.
    <http://www.mathsisfun.com/definitions/engineering-notation.html>

    filler is placed between the decimal value and 10s exponent

    Examples:
        >>> eng_notation(123, 1, 'E')
        100E0
        >>> eng_notation(1230, 3, 'E')
        1.23E3
        >>> eng_notation(.126, 2, 'E')
        120E-3

    Returns:
        string of value with the proper precision and 10s exponent that is divisable by 3

    created by William Rusnack
        github.com/BebeSparkelSparkel
        linkedin.com/in/williamrusnack/
        williamrusnack@gmail.com
    """
    is_neg, sig_digits, sci_dot, sci_power = _sci_notation(value, precision)

    eng_power = int(3 * math.floor(sci_power / 3))
    eng_dot = sci_dot + sci_power - eng_power

    return (
        ("-" if is_neg else "")
        + _place_dot(sig_digits, eng_dot)
        + filler
        + str(eng_power)
    )


def _sci_notation(value: float, precision: int) -> tuple[bool, str, int, int]:
    """Returns the properties for to construct a scientific notation number.
    used in [sci_notation][prairielearn.to_precision.sci_notation] and [eng_notation][prairielearn.to_precision.eng_notation]

    created by William Rusnack
        github.com/BebeSparkelSparkel
        linkedin.com/in/williamrusnack/
        williamrusnack@gmail.com
    """
    sig_digits, power, is_neg = _number_profile(value, precision)

    dot_power = -(precision - 1)
    ten_power = power + precision - 1

    return is_neg, sig_digits, dot_power, ten_power


def _place_dot(digits: str, power: int) -> str:
    """Places the dot in the correct spot in the digits.

    If the dot is outside the range of the digits zeros will be added.

    Examples:
        >>> _place_dot(123, 2)
        12300
        >>> _place_dot(123, -2)
        1.23
        >>> _place_dot(123, 3)
        0.123
        >>> _place_dot(123, 5)
        0.00123

    Returns:
        string of digits with the dot in the correct location

    created by William Rusnack
        github.com/BebeSparkelSparkel
        linkedin.com/in/williamrusnack/
        williamrusnack@gmail.com
    """
    if power > 0:
        out = digits + "0" * power

    elif power < 0:
        power = abs(power)
        precision = len(digits)

        if power < precision:
            out = digits[:-power] + "." + digits[-power:]

        else:
            out = "0." + "0" * (power - precision) + digits

    else:
        out = digits + ("." if digits[-1] == "0" else "")

    return out


def _number_profile(value: float, precision: int) -> tuple[str, int, bool]:
    """
    Returns:
        string of significant digits
        10s exponent to get the dot to the proper location in the significant digits
        bool that's true if value is less than zero else false

    created by William Rusnack
        github.com/BebeSparkelSparkel
        linkedin.com/in/williamrusnack/
        williamrusnack@gmail.com
    """
    if value == 0:
        sig_digits = "0" * precision
        power = -(1 - precision)
        is_neg = False

    else:
        if value < 0:
            value = abs(value)
            is_neg = True
        else:
            is_neg = False

        power = -1 * math.floor(math.log10(value)) + precision - 1
        sig_digits = str(round(abs(value) * 10.0**power))

    return sig_digits, int(-power), is_neg
