from __future__ import annotations

import ast
import re
from enum import Enum
from typing import Any, Tuple

import prairielearn as pl


class InvalidUnit(Exception):
    pass


class DisallowedExpression(Exception):
    pass


class DimensionfulQuantity:
    """A quantity and a unit strung together. Represents a number with units.

    ...

    Attributes
    ----------
    quantity : Any
        Usually some sort of number. The "Quantity" part.

    unit : Unit
        The unit accompanying the number. The "Dimensionful" part.

    Methods
    -------
    __eq__(rhs)
        Determine whether this and another DimensionfulQuantity are equal.

    sigfig_equals(rhs, digits)
        Determine whether this and another DimensionfulQuantity are equal, comparing only siginificant digits.

    relabs_equals(rhs, rtol, atol)
        Determine whether this and another DimensionfulQuantuty are within the relative and absolute tolerances.

    get_index(answer)
        Determine the index where the unit starts.

    from_string(answer)
        Construct a DimensionfulQuantity from a string.

    check_unitless(answer)
        Check whether the string has no unit portion.

    check_numberless(answer)
        Check whether the string has no number portion.
    """

    def __init__(self, quantity: Any, unit: Unit) -> None:
        """
        Parameters
        ----------
        quantity : Any
            Usually some sort of number. The "Quantity" part.

        unit : Unit
            The unit accompanying the number. The "Dimensionful" part.
        """

        self.quantity = quantity
        self.unit = unit

    def __eq__(self, rhs: DimensionfulQuantity) -> bool:
        """Determine whether this and another DimensionfulQuantity are exactly equal.

        Equality is determined by two things:
            - number * multiplier/prefix of unit has to be equal
            - unit has to has same dimensions (i.e. describe the same kind of stuff)

        Parameters
        ----------
        rhs : DimensionfulQuantity
            The other DimensionfulQuantity we are comparing to.
        """

        return self.quantity * self.unit.multiplier == rhs.quantity * rhs.unit.multiplier and self.unit == rhs.unit

    def sigfig_equals(self, rhs: DimensionfulQuantity, digits: int) -> bool:
        """Determine whether this and another DimensionfulQuantity are equal, comparing only siginificant digits.

        Equality is determined by two things:
            - number * multiplier/prefix of unit has to be equal, comparing significant digits.
            - unit has to has same dimensions (i.e. describe the same kind of stuff)

        Parameters
        ----------
        rhs : DimensionfulQuantity
            The other DimensionfulQuantity we are comparing to.

        digits : int
            The number of significant digits we are comparing.
        """

        l_val = self.quantity * self.unit.multiplier
        r_val = rhs.quantity * rhs.unit.multiplier
        return pl.is_correct_scalar_sf(r_val, l_val, digits) and self.unit == rhs.unit

    def relabs_equals(self, rhs: DimensionfulQuantity, rtol: float, atol: float) -> bool:
        """Determine whether this and another DimensionfulQuantuty are within the relative and absolute tolerances.

        Equality is determined by two things:
            - number * multiplier/prefix of unit has to be within rhs' rtol and atol
            - unit has to has same dimensions (i.e. describe the same kind of stuff)

        Parameters
        ----------
        rhs : DimensionfulQuantity
            The other DimensionfulQuantity we are comparing to.

        rtol : float
            Relative tolerance.

        atol : float
            Absolute tolerance.
        """

        l_val = self.quantity * self.unit.multiplier
        r_val = rhs.quantity * rhs.unit.multiplier
        return pl.is_correct_scalar_ra(r_val, l_val, rtol, atol)

    @staticmethod
    def get_index(answer: str) -> int:
        """Determine the index where the unit starts.

        Determines the index of first character that matches a prefix/unit in the string.
        Returns -1 if not found.

        Parameters
        ----------
        answer : str
            String to search.
        """

        regex = f"(?:({'|'.join(MetricPrefixes.__members__.keys())})?({'|'.join(MetricUnits.__members__.keys())}))|({'|'.join(ImperialUnits.__members__.keys())})"
        regex = re.compile(regex)
        m = re.search(regex, answer)  # search for valid alpha/greek for unit start
        return m.start() if m is not None else -1  # get index

    @classmethod
    def from_string(cls, answer: str) -> DimensionfulQuantity:
        """Construct a DimensionfulQuantity from a string.

        Splits a string into the number and the unit part, and parses
        them as a float and a Unit respectively.

        Parameters
        ----------
        answer : str
            String to parse
        """

        i = cls.get_index(answer)
        if i == -1:
            raise DisallowedExpression
        return DimensionfulQuantity(float(answer[:i].strip()), Unit.from_string(answer[i:].strip()))

    @classmethod
    def check_unitless(cls, answer: str) -> bool:
        """Check whether the string has no unit portion.

        Checks whether the string matches a unit/prefix at all.

        Parameters
        ----------
        answer : str
            String to search
        """

        i = cls.get_index(answer)
        return i == -1

    @classmethod
    def check_numberless(cls, answer: str) -> bool:
        """Check whether the string has no number portion.

        Checks whether the string preceding the unit/prefix character is empty.

        Parameters
        ----------
        answer : str
            String to search
        """

        i = cls.get_index(answer)
        number = answer[:i].strip()
        return not number


class Unit:
    """A unit with multiplier and dimensions. Represents a unit in terms of SI base units.

    ...

    Attributes
    ----------
    multiplier : float
        Represent the size of unit in terms of base units.

    dimensions : Tuple[int, int, int, int, int, int, int]
        Represent the degrees of the 7 base units,
        in this order: s, m, g, A, K, mol, Cd.
        Tells us what we are measuring.

    Methods
    -------
    __mul__(rhs)
        Determine the product of this and another unit/number.

    __rmul__(lhs)
        Determine the product of this and another unit/number.

    __truediv__(rhs)
        Determine the quotient of this and another unit.

    __rtruediv__(lhs)
        Determine the quotient of another unit and this.

    __pow__(exp)
        Raise the current unit to an interger power.

    __eq__(rhs)
        Check whether two units describe the same type of quantities.

    _from_prefixed_unit(prefix, unit)
        Create a unit from a prefix and a Unit.

    _single_from_string(str)
        Parse a string corresponding to a single unit to a Unit.

    from_string(str)
        Parse a string corresponding to a unit or arithmetic combination of units.
    """

    def __init__(self, multiplier: float, dimensions: Tuple[int, int, int, int, int, int, int]) -> None:
        """
        Parameters
        ----------
        multiplier : float
            Represent the size of unit in terms of base units.

        dimensions : Tuple[int, int, int, int, int, int, int]
            Represent the degrees of the 7 base units,
            in this order: s, m, g, A, K, mol, Cd.
            Tells us what we are measuring.
        """

        self.multiplier = multiplier
        self.dimensions = dimensions

    def __mul__(self, rhs: float | Unit) -> Unit:
        """Determine the product of this and another unit/number.

        If argument is float, multiplies the multiplier by the float.
        If argument is Unit, multiplies their multipliers together, and adds the dimensions element-wise.

        Parameters
        ----------
        rhs : float | Unit
            The multiplier.
        """

        if isinstance(rhs, Unit):
            new_multiplier = self.multiplier * rhs.multiplier
            new_dimensions = tuple(ldim + rdim for ldim, rdim in zip(self.dimensions, rhs.dimensions))
            return Unit(new_multiplier, new_dimensions)
        else:
            new_multiplier = self.multiplier * rhs
            return Unit(new_multiplier, self.dimensions)

    def __rmul__(self, lhs: float | Unit) -> Unit:
        """Determine the product of this and another unit/number.

        If argument is float, multiplies the multiplier by the float.
        If argument is Unit, multiplies their multipliers together, and adds the dimensions element-wise.

        Parameters
        ----------
        lhs : float | Unit
            The multiplier.
        """

        if isinstance(lhs, Unit):
            new_multiplier = lhs.multiplier * self.multiplier
            new_dimensions = tuple([ldim + rdim for ldim, rdim in zip(lhs.dimensions, self.dimensions)])
            return Unit(new_multiplier, new_dimensions)
        else:
            new_multiplier = lhs * self.multiplier
            return Unit(new_multiplier, self.dimensions)

    def __truediv__(self, rhs: Unit) -> Unit:
        """Determine the quotient of this and another unit.

        Divides this multiplier by the argument's multiplier,
        then element-wise subtract the argument's dimensions from this dimensions.

        Parameters
        ----------
        rhs : Unit
            The divisor.
        """

        new_multiplier = self.multiplier / rhs.multiplier
        new_dimensions = tuple([ldim - rdim for ldim, rdim in zip(self.dimensions, rhs.dimensions)])
        return Unit(new_multiplier, new_dimensions)

    def __rtruediv__(self, lhs: Unit) -> Unit:
        """Determine the quotient of another unit and this.

        Divides the argument's multiplier by this multiplier,
        then element-wise subtract this dimensions from the argument's dimensions.

        Parameters
        ----------
        lhs : Unit
            The dividend.
        """

        new_multiplier = lhs.multiplier / self.multiplier
        new_dimensions = tuple([ldim - rdim for ldim, rdim in zip(lhs.dimensions, self.dimensions)])
        return Unit(new_multiplier, new_dimensions)

    def __pow__(self, exp: int) -> Unit:
        """Raise the current unit to an interger power.

        Raises the multiplier to given power,
        and then element-wise multiplies the dimensions with said power.

        Parameters
        ----------
        exp : int
            The exponent, the power.
        """

        new_multiplier = self.multiplier ** exp
        new_dimensions = tuple(map(lambda x: x * exp, self.dimensions))
        return Unit(new_multiplier, new_dimensions)

    def __eq__(self, rhs: Unit) -> bool:
        """Check whether two units describe the same type of quantities.

        Checks only whether the dimensions are identical.
        Does NOT check multiplier equality.

        Parameters
        ----------
        rhs : Unit
            The other unit we are comparing to.
        """
        return self.dimensions == rhs.dimensions

    @classmethod
    def _from_prefixed_unit(cls, prefix: SIPrefix, unit: Unit) -> Unit:
        """Create a unit from a prefix and a Unit.

        This is really just a convenience method so that SI prefixes can be defined using the power of 10 by which they differ from the base unit.

        Parameters
        ----------
        prefix : SIPrefix
            Prefix to apply to the unit.

        unit : Unit
            Unit to apply the prefix to.
        """

        new_multiplier = unit.multiplier * 10 ** prefix.value
        return cls(new_multiplier, unit.dimensions)

    @classmethod
    def _single_from_string(cls, str: str) -> Unit:
        """Parse a string corresponding to a single unit to a Unit.

        This is simply a helper function for Unit.from_string,
        and deals with taking string such as "pF" and "ns" and converting them into Units.

        Parameters
        ----------
        str : str
            String to parse.
        """

        regex = f"(?:({'|'.join(MetricPrefixes.__members__.keys())})?({'|'.join(MetricUnits.__members__.keys())}))|({'|'.join(ImperialUnits.__members__.keys())})"
        regex = re.compile(regex)

        match = re.fullmatch(regex, str)

        if not match:
            raise InvalidUnit

        if match[3]:
            return ImperialUnits[match[3]].value
        else:
            if match[1]:
                return cls._from_prefixed_unit(MetricPrefixes[match[1]].value, MetricUnits[match[2]].value)
            else:
                return MetricUnits[match[2]].value

    @classmethod
    def from_string(cls, str: str) -> Unit:
        """Parse a string corresponding to a unit or arithmetic combination of units.

        Given a unit, or some group of units combined using multiplication, division, and exponention, and parse into a Unit.
        This parsing is safe, and uses a whitelist to ensure that arbitrary code execution is not possible.

        Parameters
        ----------
        str : str
            String to parse.
        """

        tree = ast.parse(str, mode='eval')
        whitelist = (ast.Expression, ast.Name, ast.Load, ast.BinOp, ast.Mult, ast.Div, ast.Pow, ast.Constant)
        CheckWhitelist(whitelist).visit(tree)
        UnitTransform().visit(tree)
        ast.fix_missing_locations(tree)
        return eval(compile(tree, '<ast>', 'eval'), None, None)


class SIBaseUnit(Unit, Enum):
    """An SI Base Unit represented as a unit object.

    Base units have exactly a single 1 and six 0's as their dimensions,
    and a multiplier of 1 by definition.

    Attributes
    ----------
    dimension : Tuple[int, int, int, int, int, int, int]
        The dimensions of said base unit.
    """

    def __init__(self, dimension: Tuple[int, int, int, int, int, int, int]) -> None:
        """
        Parameters
        ----------
        dimension : Tuple[int, int, int, int, int, int, int]
            The dimensions of said base unit.
        """

        super().__init__(1, dimension)

    Second = ([1, 0, 0, 0, 0, 0, 0])
    Metre = ([0, 1, 0, 0, 0, 0, 0])
    Gram = ([0, 0, 1, 0, 0, 0, 0])
    Ampere = ([0, 0, 0, 1, 0, 0, 0])
    Kelvin = ([0, 0, 0, 0, 1, 0, 0])
    Mole = ([0, 0, 0, 0, 0, 1, 0])
    Candela = ([0, 0, 0, 0, 0, 0, 1])


class SIPrefix(Enum):
    Yotta = 24
    Zetta = 21
    Exa = 18
    Peta = 15
    Tera = 12
    Giga = 9
    Mega = 6
    Kilo = 3
    Hecto = 2
    Deca = 1
    Unit = 0
    Deci = -1
    Centi = -2
    Milli = -3
    Micro = -6
    Nano = -9
    Pico = -12
    Femto = -15
    Atto = -18
    Zepto = -21
    Yocto = -24


class UnitTransform(ast.NodeTransformer):
    def visit_Name(self, node):
        return ast.copy_location(
            ast.Call(
                func=ast.Attribute(
                    value=ast.Name(id='Unit', ctx=ast.Load()),
                    attr='_single_from_string',
                    ctx=ast.Load()
                ),
                args=[ast.Constant(value=node.id)],
                keywords=[]
            ),
            node
        )


class CheckWhitelist(ast.NodeVisitor):
    def __init__(self, whitelist):
        self.whitelist = whitelist

    def visit(self, node):
        if not isinstance(node, self.whitelist):
            raise DisallowedExpression
        return super().visit(node)


class MetricUnits(Enum):
    s = SIBaseUnit.Second
    m = SIBaseUnit.Metre
    g = SIBaseUnit.Gram
    A = SIBaseUnit.Ampere
    K = SIBaseUnit.Kelvin
    mol = SIBaseUnit.Mole
    cd = SIBaseUnit.Candela
    rad = SIBaseUnit.Metre / SIBaseUnit.Metre
    sr = SIBaseUnit.Metre ** 2 / SIBaseUnit.Metre ** 2
    Hz = SIBaseUnit.Second ** -1
    N = 1000 * SIBaseUnit.Gram * SIBaseUnit.Metre * SIBaseUnit.Second ** -2
    Pa = 1000 * SIBaseUnit.Gram * SIBaseUnit.Metre ** -1 * SIBaseUnit.Second ** -2
    J = 1000 * SIBaseUnit.Gram * SIBaseUnit.Metre ** 2 * SIBaseUnit.Second ** -2
    W = 1000 * SIBaseUnit.Gram * SIBaseUnit.Metre ** 2 * SIBaseUnit.Second ** -3
    C = SIBaseUnit.Second * SIBaseUnit.Ampere
    V = 1000 * SIBaseUnit.Gram * SIBaseUnit.Metre ** 2 * SIBaseUnit.Second ** -3 * SIBaseUnit.Ampere ** -1
    F = 1000 * SIBaseUnit.Gram ** -1 * SIBaseUnit.Metre ** -2 * SIBaseUnit.Second ** 4 * SIBaseUnit.Ampere ** 2
    Ohm = 1000 * SIBaseUnit.Gram * SIBaseUnit.Metre ** 2 * SIBaseUnit.Second ** -3 * SIBaseUnit.Ampere ** -2
    Ω = 1000 * SIBaseUnit.Gram * SIBaseUnit.Metre ** 2 * SIBaseUnit.Second ** -3 * SIBaseUnit.Ampere ** -2
    S = 1000 * SIBaseUnit.Gram ** -1 * SIBaseUnit.Metre ** -2 * SIBaseUnit.Second ** 3 * SIBaseUnit.Ampere ** 2
    Wb = 1000 * SIBaseUnit.Gram * SIBaseUnit.Metre ** 2 * SIBaseUnit.Second ** -2 * SIBaseUnit.Ampere ** -1
    T = 1000 * SIBaseUnit.Gram * SIBaseUnit.Second ** -2 * SIBaseUnit.Ampere ** -1
    H = 1000 * SIBaseUnit.Gram * SIBaseUnit.Metre ** 2 * SIBaseUnit.Second ** -2 * SIBaseUnit.Ampere ** -2

    # some common metric units that are not technically SI
    min = 60 * SIBaseUnit.Second
    h = 3600 * SIBaseUnit.Second
    d = 86400 * SIBaseUnit.Second
    au = 149597870700 * SIBaseUnit.Metre
    L = 1e-3 * SIBaseUnit.Metre ** 3
    eV = 1.602176634e-19 * 1000 * SIBaseUnit.Gram * SIBaseUnit.Metre ** 2 * SIBaseUnit.Second ** -2


class MetricPrefixes(Enum):
    Y = SIPrefix.Yotta
    Z = SIPrefix.Zetta
    E = SIPrefix.Exa
    P = SIPrefix.Peta
    T = SIPrefix.Tera
    G = SIPrefix.Giga
    M = SIPrefix.Mega
    k = SIPrefix.Kilo
    h = SIPrefix.Hecto
    da = SIPrefix.Deca
    d = SIPrefix.Deci
    c = SIPrefix.Centi
    m = SIPrefix.Milli
    μ = SIPrefix.Micro
    n = SIPrefix.Nano
    p = SIPrefix.Pico
    f = SIPrefix.Femto
    a = SIPrefix.Atto
    z = SIPrefix.Zepto
    y = SIPrefix.Yocto


class ImperialUnits(Enum):
    ft = 0.3048 * SIBaseUnit.Metre
    yd = 0.9144 * SIBaseUnit.Metre
    mi = 1609.344 * SIBaseUnit.Metre
    acre = 4046.8564224 * SIBaseUnit.Metre ** 2
    oz = 28.349523125 * SIBaseUnit.Gram
    lb = 453.59237 * SIBaseUnit.Gram
