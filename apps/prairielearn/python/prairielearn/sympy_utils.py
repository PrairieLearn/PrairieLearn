"""Utility functions for parsing and evaluating SymPy expressions.

```python
from prairielearn.sympy_utils import ...
```
"""

import ast
import copy
import html
import operator
import re
import string
from collections import deque
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from enum import Enum
from functools import wraps
from tokenize import NAME, NUMBER, OP, TokenError
from types import CodeType
from types import MappingProxyType as FrozenDict
from typing import Any, Final, Literal, TypeAlias, TypedDict, TypeGuard, cast

import sympy
from sympy.parsing import sympy_parser
from sympy.parsing.sympy_parser import DICT, TOKEN, TRANS
from sympy.printing.str import StrPrinter
from typing_extensions import NotRequired

from prairielearn.misc_utils import full_unidecode

STANDARD_OPERATORS = ("( )", "+", "-", "*", "/", "^", "**", "!")
SET_NOTATION_OPERATORS = ("U", "&", "{ }", "[ , ]", "( , ]", "[ , )", "( , )")

SympyMapT = dict[str, sympy.Basic | complex]
_FrozenSympyMapT = FrozenDict[str, sympy.Basic | complex]
_FrozenSympyFunctionMapT = FrozenDict[str, Callable[..., Any]]
SympyFunctionMapT = dict[str, Callable[..., Any]]
AssumptionsDictT = dict[str, dict[str, Any]]
"""
A dictionary of assumptions for variables in the expression.

Examples:
    >>> {"x": {"positive": True}, "y": {"real": True}}
"""

ASTWhiteListT = tuple[type[ast.AST], ...]


class SympyJson(TypedDict):
    """A class with type signatures for the SymPy JSON dict"""

    _type: Literal["sympy"]
    _value: str
    _variables: list[str]
    _assumptions: NotRequired[AssumptionsDictT]
    _custom_functions: NotRequired[list[str]]


@dataclass(frozen=True, slots=True)
class SympyParseSuccess:
    expr: sympy.Expr


@dataclass(frozen=True, slots=True)
class SympyParseFailure:
    error: str


SympyParseResult: TypeAlias = SympyParseSuccess | SympyParseFailure


def is_sympy_json(json: Any) -> TypeGuard[SympyJson]:
    """Check if the input is a valid SymPy JSON dict.

    Returns:
        `True` if the input is a valid SymPy JSON dict, `False` otherwise.
    """
    return (
        isinstance(json, dict)
        and json.get("_type") == "sympy"
        and isinstance(json.get("_value"), str)
        and isinstance(json.get("_variables"), list)
        and isinstance(json.get("_assumptions", {}), dict)
        and isinstance(json.get("_custom_functions", []), list)
    )


class LocalsForEval(TypedDict):
    """A class with type signatures for the locals_for_eval dict"""

    functions: SympyFunctionMapT
    variables: SympyMapT
    helpers: SympyFunctionMapT


class _Constants:
    helpers: Final[_FrozenSympyFunctionMapT] = FrozenDict({
        "Number": sympy.Number,
        "_Integer": sympy.Integer,
    })

    variables: Final[_FrozenSympyMapT] = FrozenDict({
        "pi": sympy.pi,
        "e": sympy.E,
        "infty": sympy.oo,
    })

    hidden_variables: Final[_FrozenSympyMapT] = FrozenDict({
        "_Exp1": sympy.E,
    })

    complex_variables: Final[_FrozenSympyMapT] = FrozenDict({
        "i": sympy.I,
        "j": sympy.I,
    })

    hidden_complex_variables: Final[_FrozenSympyMapT] = FrozenDict({
        "_ImaginaryUnit": sympy.I,
    })

    functions: Final[_FrozenSympyFunctionMapT] = FrozenDict({
        "exp": sympy.exp,
        "log": sympy.log,
        "ln": sympy.log,
        "sqrt": sympy.sqrt,
        "factorial": sympy.factorial,
        "abs": sympy.Abs,
        "sgn": sympy.sign,
        "max": sympy.Max,
        "min": sympy.Min,
        # Extra aliases to make parsing works correctly
        "sign": sympy.sign,
        "Abs": sympy.Abs,
        "Max": sympy.Max,
        "Min": sympy.Min,
    })

    trig_functions: Final[_FrozenSympyFunctionMapT] = FrozenDict({
        "cos": sympy.cos,
        "sin": sympy.sin,
        "tan": sympy.tan,
        "sec": sympy.sec,
        "cot": sympy.cot,
        "csc": sympy.csc,
        "cosh": sympy.cosh,
        "sinh": sympy.sinh,
        "tanh": sympy.tanh,
        "arccos": sympy.acos,
        "arcsin": sympy.asin,
        "arctan": sympy.atan,
        "acos": sympy.acos,
        "asin": sympy.asin,
        "atan": sympy.atan,
        "arctan2": sympy.atan2,
        "atan2": sympy.atan2,
        "atanh": sympy.atanh,
        "acosh": sympy.acosh,
        "asinh": sympy.asinh,
    })

    set_functions: Final[_FrozenSympyFunctionMapT] = FrozenDict({
        "Interval": sympy.Interval,
        "FiniteSet": sympy.FiniteSet,
        "Union": sympy.Union,
        "Intersection": sympy.Intersection,
    })

    set_operators: Final[_FrozenSympyFunctionMapT] = FrozenDict({
        "U": operator.or_,
        "cup": operator.or_,
        "∪": operator.or_,  # noqa: RUF001
        "cap": operator.and_,
        "∩": operator.and_,
    })

    set_operator_desugars: Final[FrozenDict[str, str]] = FrozenDict({
        "U": "|",
        "cup": "|",
        "∪": "|",  # noqa: RUF001
        "cap": "&",
        "∩": "&",
    })


class _SympyJsonStrPrinter(StrPrinter):
    """String printer that keeps set notation parseable by avoiding banned ast nodes.

    Callers must deserialize with `allow_sets=True` or the literal forms will be rejected.
    """

    def _print_EmptySet(self, expr: sympy.Set) -> str:  # type: ignore[reportIncompatibleMethodOverride] # noqa: ARG002, N802
        return "{}"

    def _print_Interval(self, i: sympy.Interval) -> str:  # noqa: N802
        start, end = self._print(i.start), self._print(i.end)
        left = "(" if i.left_open else "["
        right = ")" if i.right_open else "]"
        return f"{left}{start}, {end}{right}"


# Safe evaluation of user input to convert from string to sympy expression.
#
# Adapted from:
# https://stackoverflow.com/a/30516254
#
# Documentation of ast:
# https://docs.python.org/3/library/ast.html
#
# More documentation of ast:
# https://greentreesnakes.readthedocs.io/
#
# FIXME: As of 2017-08-27 there is an open sympy issue discussing a
# similar approach: https://github.com/sympy/sympy/issues/10805 and an
# associated PR: https://github.com/sympy/sympy/pull/12524 but it is
# unclear when/if they will be merged. We should check once sympy 1.2
# is released and see whether we can switch to using
# `sympify(..., safe=True)`.
#
# For examples of the type of attacks that we are avoiding:
# https://nedbatchelder.com/blog/201206/eval_really_is_dangerous.html
# http://blog.delroth.net/2013/03/escaping-a-python-sandbox-ndh-2013-quals-writeup/
#
# Another class of attacks is those that try and consume excessive
# memory or CPU (e.g., `10**100**100`). We handle these attacks by the
# fact that the entire element code runs in an isolated subprocess, so
# this type of input will be caught and treated as a question code
# failure.
#
# Other approaches for safe(r) eval in Python are:
#
# PyParsing:
#     http://pyparsing.wikispaces.com
#     http://pyparsing.wikispaces.com/file/view/fourFn.py
#
# RestrictedPython:
#     https://pypi.python.org/pypi/RestrictedPython
#     http://restrictedpython.readthedocs.io/
#
# Handling timeouts explicitly:
#     http://code.activestate.com/recipes/496746-restricted-safe-eval/
#
# A similar (but more complex) approach to us:
#     https://github.com/newville/asteval


class BaseSympyError(Exception):
    """Exception base class for SymPy parsing errors"""


class HasConflictingVariableError(BaseSympyError):
    pass


class HasConflictingFunctionError(BaseSympyError):
    pass


class HasInvalidAssumptionError(BaseSympyError):
    pass


@dataclass
class HasFloatError(BaseSympyError):
    n: float


class HasComplexError(BaseSympyError):
    pass


@dataclass
class HasSetNotationError(BaseSympyError):
    pass


@dataclass
class HasInvalidExpressionError(BaseSympyError):
    offset: int


@dataclass
class HasInvalidFunctionError(BaseSympyError):
    offset: int
    text: str


@dataclass
class FunctionNameWithoutArgumentsError(BaseSympyError):
    offset: int
    text: str


@dataclass
class HasParseError(BaseSympyError):
    offset: int


@dataclass
class HasEscapeError(BaseSympyError):
    offset: int


@dataclass
class HasCommentError(BaseSympyError):
    offset: int


@dataclass
class HasInvalidSymbolError(BaseSympyError):
    symbol: str


# Deprecated / unused, kept for backwards compatibility.
@dataclass
class HasInvalidVariableError(BaseSympyError):
    """Deprecated / unused."""

    offset: int
    text: str


class ASTSympyType(Enum):
    SCALAR = "number"
    SET = "set"
    BOOL = "true/false"
    STRING = "text"

    def __str__(self) -> str:
        """Returns `self.value`"""
        return self.value


@dataclass
class HasArgumentTypeError(BaseSympyError):
    fn: str
    got: ASTSympyType
    allowable_types: Sequence[ASTSympyType]
    arg_idx: int
    offset: int = -1

    def format_allowable_types(self) -> str:
        if len(self.allowable_types) == 1:
            return f"a {self.allowable_types[0]}"
        return f"either {_format_comma_separated(list(dict.fromkeys(self.allowable_types)))}"

    def as_type_error(self) -> TypeError:
        # NOTE: must match format of `_TYPE_ERROR_OPERATOR_PATTERN`
        return TypeError(
            f"unsupported operand type(s) for {self.fn}: "
            f"argument #{self.arg_idx + 1} requires {self.format_allowable_types()}, not {self.got}"
        )


@dataclass
class HasFunctionArityError(BaseSympyError):
    fn: str
    provided: int
    expected: str
    offset: int = -1

    def as_type_error(self) -> TypeError:
        # NOTE: must match format of `_TYPE_ERROR_OPERATOR_PATTERN`
        return TypeError(
            f"wrong number of arguments for {self.fn}: "
            f"got {self.provided} but expected {self.expected}"
        )


class CheckAST(ast.NodeVisitor):
    whitelist: ASTWhiteListT
    variables: SympyMapT
    functions: SympyFunctionMapT
    __parents: dict[int, ast.AST]
    __type_cache: dict[int, ASTSympyType | None]

    __unparsed_opstr: FrozenDict[type[ast.AST], str] = FrozenDict({
        ast.Add: "+",
        ast.BitAnd: "&",
        ast.BitOr: "|",
        ast.Div: "/",
        ast.Mod: "%",
        ast.Mult: "*",
        ast.Pow: "**",
        ast.Sub: "-",
    })

    def __init__(
        self,
        whitelist: ASTWhiteListT,
        variables: SympyMapT,
        functions: SympyFunctionMapT,
        *,
        allow_sets: bool = False,
    ) -> None:
        self.whitelist = whitelist
        self.variables = variables
        self.functions = functions
        self.__parents = {}
        self.__type_cache = {}
        self.allow_sets = allow_sets

    def visit(self, node: ast.AST) -> ASTSympyType | None:
        if not isinstance(node, self.whitelist):
            err_node = self.get_parent_with_location(node)
            raise HasInvalidExpressionError(err_node.col_offset)
        return super().visit(node)

    def is_name_of_function(self, node: ast.AST) -> bool:
        # The node is the name of a function if all of the following are true:
        # 1) it has type ast.Name
        # 2) its parent has type ast.Call
        # 3) it is not in the list of parent's args
        if not isinstance(node, ast.Name):
            return False

        parent = self.__parents[id(node)]

        return isinstance(parent, ast.Call) and (node not in parent.args)

    def get_parent_with_location(self, node: ast.AST) -> Any:
        while id(node) in self.__parents:
            if hasattr(node, "col_offset"):
                return node

            node = self.__parents[id(node)]

        return node

    def check_expression(self, expr: str) -> None:
        # Parse (convert string to AST)
        try:
            root = ast.parse(expr, mode="eval")
        except SyntaxError as exc:
            offset = exc.offset if exc.offset is not None else -1
            raise HasParseError(offset) from exc

        # Link each node to its parent
        self.__parents = {
            id(child): node
            for node in ast.walk(root)
            for child in ast.iter_child_nodes(node)
        }
        try:
            self.visit(root)
        finally:
            self.__parents = {}
            self.__type_cache = {}

    def _set_type(
        self, node: ast.AST, inferred_type: ASTSympyType | None
    ) -> ASTSympyType | None:
        self.__type_cache[id(node)] = inferred_type
        return inferred_type

    def _get_type(self, node: ast.AST) -> ASTSympyType | None:
        if id(node) in self.__type_cache:
            return self.__type_cache[id(node)]
        return self.visit(node)

    def visit_Expression(self, node: ast.Expression) -> ASTSympyType | None:
        return self._set_type(node, self._get_type(node.body))

    def visit_Constant(self, node: ast.Constant) -> ASTSympyType | None:
        if node.value is True or node.value is False:
            return self._set_type(node, ASTSympyType.BOOL)
        if node.kind is not None:
            return self._set_type(node, ASTSympyType.STRING)
        return self._set_type(node, ASTSympyType.SCALAR)

    def visit_Name(self, node: ast.Name) -> ASTSympyType | None:
        if (
            isinstance(node.ctx, ast.Load)
            and not self.is_name_of_function(node)
            and node.id not in self.variables
        ):
            err_node = self.get_parent_with_location(node)
            if node.id in self.functions:
                raise FunctionNameWithoutArgumentsError(
                    err_node.col_offset, err_node.id
                )
            return self._set_type(node, None)

        if node.id in self.variables:
            var_type = None if self.allow_sets else ASTSympyType.SCALAR
            return self._set_type(node, var_type)

        return self._set_type(node, None)

    def visit_Call(self, node: ast.Call) -> ASTSympyType | None:
        if isinstance(node.func, ast.Name) and node.func.id not in self.functions:
            err_node = self.get_parent_with_location(node)
            raise HasInvalidFunctionError(err_node.col_offset, err_node.func.id)

        self.generic_visit(node)

        if not isinstance(node.func, ast.Name):
            return self._set_type(node, None)

        name, args = node.func.id, node.args
        match name:
            case "Symbol":
                return self._set_type(node, None)
            case "Integer" | "Float":
                overloads = [ASTSympyType.SCALAR], [ASTSympyType.STRING]
                self._enforce_signature(name, args, *overloads)
                return self._set_type(node, ASTSympyType.SCALAR)
            case fn if self.allow_sets and fn in _Constants.set_functions:
                return self._set_type(node, self._infer_set_function_type(name, args))
            case fn if fn in _Constants.functions or fn in _Constants.trig_functions:
                self._enforce_signature(fn, args, len(args) * [ASTSympyType.SCALAR])
                return self._set_type(node, ASTSympyType.SCALAR)
            case _:
                return self._set_type(node, None)

    def visit_UnaryOp(self, node: ast.UnaryOp) -> ASTSympyType | None:
        operand_type = self._get_type(node.operand)
        if operand_type == ASTSympyType.SET:
            err_node = self.get_parent_with_location(node)
            raise HasInvalidExpressionError(err_node.col_offset)
        return self._set_type(node, operand_type)

    def visit_BinOp(self, node: ast.BinOp) -> ASTSympyType | None:
        op_str = self.__unparsed_opstr.get(type(node.op))
        if op_str is None:
            return self._set_type(node, None)
        inferred_type = self._infer_bin_op_type(op_str, node.left, node.right)
        return self._set_type(node, inferred_type)

    def _enforce_signature(
        self,
        fn_name: str,
        args: Sequence[ast.expr],
        *overloads: Sequence[ASTSympyType | None],
    ) -> tuple[ASTSympyType | None, ...]:
        arity_matches = [s for s in overloads if len(s) == len(args)]
        if not arity_matches:
            msg = _format_comma_separated(sorted(set(map(len, overloads))))
            raise HasFunctionArityError(fn_name, len(args), msg)

        arg_types = tuple(map(self._get_type, args))

        fails: list[tuple[int, ASTSympyType, ASTSympyType]] = []
        for signature in arity_matches:
            for i, (expected, got) in enumerate(zip(signature, arg_types, strict=True)):
                if got is not None and expected is not None and got != expected:
                    fails.append((i, expected, got))
                    break
            else:
                return arg_types

        arg_index, _, got = max(fails, key=lambda f: f[0])
        expecteds = [e for i, e, _ in fails if i == arg_index]
        raise HasArgumentTypeError(fn_name, got, expecteds, arg_idx=arg_index)

    def _infer_set_function_type(
        self, name: str, args: list[ast.expr]
    ) -> ASTSympyType | None:
        match name:
            case "FiniteSet":
                return ASTSympyType.SET
            case "Interval":
                self._enforce_signature(
                    name,
                    args,
                    (ASTSympyType.SCALAR, ASTSympyType.SCALAR),
                    (2 * [ASTSympyType.SCALAR] + 2 * [ASTSympyType.BOOL]),
                )
                return ASTSympyType.SET
            case "Union" | "Intersection":
                if not args:
                    raise HasFunctionArityError(name, len(args), "1+")
                self._enforce_signature(name, args, len(args) * [ASTSympyType.SET])
                return ASTSympyType.SET
            case _:
                return None

    def _infer_bin_op_type(
        self, op: str, left: ast.expr, right: ast.expr
    ) -> ASTSympyType | None:
        match op:
            case "|" | "&":
                self._enforce_signature(op, (left, right), 2 * [ASTSympyType.SET])
                return ASTSympyType.SET
            case "-" | "+":
                overloads = (2 * [ASTSympyType.SET]), (2 * [ASTSympyType.SCALAR])
                left_type, _ = self._enforce_signature(op, (left, right), *overloads)
                return left_type
            case "**" | "*" | "/" | "%":
                self._enforce_signature(op, (left, right), 2 * [ASTSympyType.SCALAR])
                return ASTSympyType.SCALAR
            case _:
                lt, rt = self._get_type(left), self._get_type(right)
                if lt is None or rt is None or lt == rt:
                    return lt or rt
                return None


def ast_check_str(
    expr: str, locals_for_eval: LocalsForEval, *, allow_sets: bool = False
) -> None:
    """Check the AST of the expression for security, whitelisting only certain nodes.

    This prevents the user from executing arbitrary code through `eval_expr`.
    """
    # Disallow AST nodes that are not in whitelist
    #
    # Be very careful about adding to the list below. In particular,
    # do not add `ast.Attribute` without fully understanding the
    # reflection-based attacks described by
    # https://nedbatchelder.com/blog/201206/eval_really_is_dangerous.html
    # http://blog.delroth.net/2013/03/escaping-a-python-sandbox-ndh-2013-quals-writeup/
    #
    # Note some whitelist items were removed in this PR:
    # https://github.com/PrairieLearn/PrairieLearn/pull/7020
    # If there are compatibility issues, try adding those items back.
    whitelist: ASTWhiteListT = (
        ast.Load,
        ast.Expression,
        ast.Call,
        ast.Name,
        ast.Constant,
        ast.UnaryOp,
        ast.UAdd,
        ast.USub,
        ast.BinOp,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.Mod,
        ast.Pow,
        ast.BitAnd,
        ast.BitOr,
    )

    CheckAST(
        whitelist,
        locals_for_eval["variables"],
        locals_for_eval["helpers"] | locals_for_eval["functions"],
        allow_sets=allow_sets,
    ).check_expression(expr)


def sympy_check(
    expr: sympy.Expr,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool,
    allow_sets: bool,
) -> None:
    """Check the SymPy expression for complex numbers, invalid symbols, and floats."""
    valid_symbols = set().union(
        *(cast(SympyMapT, inner_dict).keys() for inner_dict in locals_for_eval.values())
    )

    work_stack: deque[sympy.Basic] = deque([expr])

    while work_stack:
        item = work_stack.pop()
        str_item = str(item)

        if isinstance(item, sympy.Symbol) and str_item not in valid_symbols:
            raise HasInvalidSymbolError(str_item)
        if isinstance(item, sympy.Float):
            raise HasFloatError(float(str_item))
        if not allow_sets and isinstance(item, sympy.Set):
            raise HasSetNotationError
        # Detect complex numbers both in simplified form (sympy.I) and in
        # unevaluated form (e.g. sqrt(-2) kept as Pow(-2, 1/2) by evaluateFalse).
        # The is_finite guard excludes zoo (complex infinity from 1/0) and similar
        # non-finite values, which aren't complex in the student-input sense.
        #
        # The is_extended_real query can trigger internal sympy bugs on certain
        # unevaluated expressions (e.g. sec(0) with evaluateFalse), so we catch
        # AttributeError and skip the check for those items.
        if not allow_complex:
            if item is sympy.I:
                raise HasComplexError("complex values not allowed")
            try:
                is_complex = (
                    item.is_extended_real is False
                    and getattr(item, "is_finite", None) is not False
                )
            except AttributeError:
                is_complex = False
            if is_complex:
                raise HasComplexError("complex values not allowed")

        work_stack.extend(item.args)


def evaluate(
    expr: str,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool = False,
    allow_sets: bool = False,
) -> sympy.Expr:
    """Evaluate a SymPy expression string with a given set of locals, and return only the result.

    Returns:
        A SymPy expression.
    """
    return evaluate_with_source(
        expr,
        locals_for_eval,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )[0]


def _format_comma_separated(items: Iterable[Any], last_conjunction: str = "or") -> str:
    comma_sep = ", ".join(map(str, items))
    return f" {last_conjunction} ".join(comma_sep.rsplit(", ", maxsplit=1))


def _normalize_expr(expr: str) -> tuple[str, list[int]]:
    """Normalize expr and build a mapping from normalized indices to original indices."""
    parts: list[str] = []
    offsets: list[int] = []
    for ind, char in enumerate(expr):
        normalized_char = char
        # Single-char codepoints only; multi-char keys like "cup" are unidecoded char-by-char (no-op for ASCII).
        if char not in _Constants.set_operators:
            normalized_char = full_unidecode(greek_unicode_transform(char))
        parts.append(normalized_char)
        offsets.extend([ind] * len(normalized_char))
    return "".join(parts), offsets


def _regex_sub_expr_and_map_offsets(
    expr: str, offsets: list[int], pattern: re.Pattern[str], replacement: str
) -> tuple[str, list[int]]:
    r"""Apply a regex substitution while keeping the offset map aligned.

    Returns:
        a tuple of the transformed expr and the new offset list

    Example:
        >>> import re
        >>> _regex_sub_expr_and_map_offsets(
        ...     "x^2",
        ...     [0, 1, 2],
        ...     re.compile(r"\\^"),
        ...     r"**",
        ... )
        ('x**2', [0, 1, 1, 2])
    """
    parts: list[str] = []
    new_offsets: list[int] = []
    last_end = 0

    for match in pattern.finditer(expr):
        parts.append(expr[last_end : match.start()])
        new_offsets.extend(offsets[last_end : match.start()])
        replacement_text = match.expand(replacement)
        parts.append(replacement_text)
        new_offsets.extend([offsets[match.start()]] * len(replacement_text))
        last_end = match.end()

    parts.append(expr[last_end:])
    new_offsets.extend(offsets[last_end:])
    return "".join(parts), new_offsets


def evaluate_with_source(
    expr: str,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool = False,
    allow_sets: bool = False,
    simplify_expression: bool = True,
) -> tuple[sympy.Expr, str | CodeType]:
    """Evaluate a SymPy expression string with a given set of locals.

    Returns:
        A tuple of the SymPy expression and the code that was used to generate it.

    Raises:
        HasEscapeError: If the expression contains an escape character.
        HasCommentError: If the expression contains a comment character.
        HasSetNotationError: If the expression contains interval or set characters.
        HasArgumentTypeError: If an expression is given the wrong types.
        HasFunctionArityError: If a function is given the wrong number of args.
        HasParseError: If the expression cannot be parsed.
        BaseSympyError: If the expression cannot be evaluated.
    """
    normalized_expr, char_offsets = _normalize_expr(expr)

    # Check for escape and comment characters after normalization, since some
    # unicode characters normalize to "#" or "\\". The offset map translates
    # back to the original string position in all cases.
    ind = normalized_expr.find("\\")
    if ind != -1:
        raise HasEscapeError(char_offsets[ind])
    ind = normalized_expr.find("#")
    if ind != -1:
        raise HasCommentError(char_offsets[ind])

    # the only thing this can't catch is open intervals `(-, -)`, checked later
    if not allow_sets and any(
        token in normalized_expr
        for token in ("[", "]", "{", "}", "∪", "∩", "&", "|")  # noqa: RUF001
    ):
        raise HasSetNotationError

    # Replace '^' with '**' wherever it appears. In MATLAB, either can be used
    # for exponentiation. In Python, only the latter can be used.
    normalized_expr, char_offsets = _regex_sub_expr_and_map_offsets(
        normalized_expr, char_offsets, re.compile(r"\^"), r"**"
    )

    # Prevent Python from interpreting patterns like "2e+3" or "2e-3" as scientific
    # notation floats. When users write "2e+3", they likely mean "2*e + 3" (2 times
    # Euler's number plus 3), not 2000.0.
    normalized_expr, char_offsets = _regex_sub_expr_and_map_offsets(
        normalized_expr,
        char_offsets,
        re.compile(r"(\d)([eE])([+-])"),
        r"\1*\2\3",
    )

    # When complex numbers are not allowed, prevent Python from interpreting
    # patterns like "3j" or "3J" as complex literals. Convert "<digits>j" to "<digits>*j"
    # so that 'j' is treated as a variable instead. This fixes issue #13661.
    #
    # The negative lookahead (?![a-zA-Z0-9]) ensures we only match standalone "j"/"J".
    # Patterns like "3jn" are NOT transformed because Python tokenizes "3jn" as "3j"
    # (complex) + "n" regardless - they will still fail with HasComplexError.
    if not allow_complex:
        normalized_expr, char_offsets = _regex_sub_expr_and_map_offsets(
            normalized_expr,
            char_offsets,
            re.compile(r"(\d)([jJ])(?![a-zA-Z0-9])"),
            r"\1*\2",
        )

    local_dict = {
        k: v
        for inner_dict in locals_for_eval.values()
        for k, v in cast(SympyMapT, inner_dict).items()
    }

    # Based on code here:
    # https://github.com/sympy/sympy/blob/26f7bdbe3f860e7b4492e102edec2d6b429b5aaf/sympy/parsing/sympy_parser.py#L1086

    # Global dict is set up to be very permissive for parsing purposes
    # (makes it cleaner to call this function with a custom locals dict).
    # This line shouldn't be dangerous, as it's just loading the global dict.
    global_dict = {}
    exec("from sympy import *", global_dict)

    transformations = (
        *sympy_parser.standard_transformations,
        sympy_parser.implicit_multiplication_application,
    )
    if allow_sets:
        transformations = (
            _unmangle_infix_binops_transformation(_Constants.set_operators.keys()),
            _set_literal_transformation,
            _set_operation_transformation,
            _interval_transformation,
            *transformations,
        )
    else:
        # check for open intervals
        transformations = (
            _err_on_transform(_interval_transformation, HasSetNotationError),
            *transformations,
        )

    try:
        code = sympy_parser.stringify_expr(
            normalized_expr, local_dict, global_dict, transformations
        )
    except (TokenError, IndexError) as exc:
        # SymPy can raise IndexError on malformed token streams for some invalid
        # inputs instead of a cleaner TokenError. Treat those the same way so the
        # caller receives a normal syntax error rather than an unexpected error.
        raise HasParseError(-1) from exc

    # First do AST check, mainly for security
    parsed_locals_to_eval = copy.deepcopy(locals_for_eval)

    # Add locals that appear after sympy stringification
    # This check is only for safety, so won't change what gets parsed
    parsed_locals_to_eval["functions"].update(
        Integer=sympy.Integer,
        Symbol=sympy.Symbol,
        Float=sympy.Float,
        Interval=sympy.Interval,
        Union=sympy.Union,
        Intersection=sympy.Intersection,
    )

    parsed_locals_to_eval["variables"].update(
        I=sympy.I,
        oo=sympy.oo,
    )

    try:
        ast_check_str(code, parsed_locals_to_eval, allow_sets=allow_sets)
    except (HasArgumentTypeError, HasFunctionArityError) as exc:
        index = _find_type_error_offset(
            normalized_expr, char_offsets, exc.as_type_error()
        )
        if index != -1:
            exc.offset = index

        raise

    if not simplify_expression:
        code = compile(sympy_parser.evaluateFalse(code), "<string>", "eval")

    # Now that it's safe, get sympy expression
    try:
        res = sympy_parser.eval_expr(code, local_dict, global_dict)
    except TypeError as exc:
        # SymPy raises TypeError for semantically invalid set operations that are
        # nonetheless syntactically valid (e.g. `{1, 2} / {3, 4}`, `sin((1, 3])`).
        # Because the AST check above already ran, TypeErrors here are expected to
        # come from SymPy's own type system, not from Python infrastructure bugs.
        index = _find_type_error_offset(normalized_expr, char_offsets, exc)
        if index != -1:
            raise HasParseError(index) from exc
        # if we can't localize the type error, report to staff.
        raise BaseSympyError from exc
    except Exception as exc:
        raise BaseSympyError from exc

    # Finally, check for invalid symbols
    sympy_check(
        res,
        locals_for_eval,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )

    return res, code


def convert_string_to_sympy(
    expr: str,
    variables: Iterable[str] | None = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
    custom_functions: Iterable[str] | None = None,
    assumptions: AssumptionsDictT | None = None,
) -> sympy.Expr:
    """
    Convert a string to a SymPy expression, with optional restrictions on
    the variables and functions that can be used. If the string is invalid,
    raise an exception with a message that can be displayed to the user.

    Parameters:
        expr: The string to convert to a SymPy expression.
        variables: A list of variable names that are allowed in the expression.
        allow_hidden: Whether to allow hidden variables (like pi and e).
        allow_complex: Whether to allow complex numbers (like i).
        allow_trig_functions: Whether to allow trigonometric functions.
        simplify_expression: Whether to simplify the expression during conversion by evaluating it.
        custom_functions: A list of custom function names that are allowed in the expression.
        assumptions: A dictionary of assumptions for variables in the expression.

    Examples:
        >>> convert_string_to_sympy("n * sin(7*m) + m**2 * cos(6*n)", variables=["m", "n"])
        n * sympy.sin(m * 7) + m * m * sympy.cos(n * 6)
        >>> convert_string_to_sympy("-infty")
        -sympy.oo
        >>> convert_string_to_sympy("z**2 + y - x", variables=["x", "y", "z"], allow_complex=True, assumptions={"x": {"positive": False}, "z": {"complex": True}})

    Returns:
        A sympy expression.
    """
    return convert_string_to_sympy_with_source(
        expr,
        variables=variables,
        allow_hidden=allow_hidden,
        allow_sets=allow_sets,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig_functions,
        simplify_expression=simplify_expression,
        custom_functions=custom_functions,
        assumptions=assumptions,
    )[0]


def convert_string_to_sympy_with_source(
    expr: str,
    variables: Iterable[str] | None = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
    custom_functions: Iterable[str] | None = None,
    assumptions: AssumptionsDictT | None = None,
) -> tuple[sympy.Expr, str | CodeType]:
    """
    Convert a string to a sympy expression, with optional restrictions on
    the variables and functions that can be used. If the string is invalid,
    raise an exception with a message that can be displayed to the user.

    Returns:
        A tuple of the sympy expression and the source code that was used to generate it.

    Raises:
        HasInvalidAssumptionError: If the assumptions are not valid.
        HasConflictingVariableError: If the variable names conflict with existing names.
        HasConflictingFunctionError: If the function names conflict with existing names.
    """
    # Check assumptions are all made about valid variables only
    if assumptions is not None:
        unbound_variables = assumptions.keys() - set(
            variables if variables is not None else []
        )
        if unbound_variables:
            raise HasInvalidAssumptionError(
                f"Assumptions for variables that are not present: {','.join(unbound_variables)}"
            )

    # Check user-defined names are valid
    conflict_vars, conflict_fns, valid_names = _build_name_conflict_data(
        variables if variables is not None else [],
        custom_functions if custom_functions is not None else [],
        allow_complex=allow_complex,
        allow_hidden=allow_hidden,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
    )

    if conflict_vars:
        raise HasConflictingVariableError(
            f"Conflicting variable name(s): {', '.join(conflict_vars)}"
        )
    if conflict_fns:
        raise HasConflictingFunctionError(
            f"Conflicting function name(s): {', '.join(conflict_fns)}"
        )

    # Create a whitelist of valid functions and variables (and a special flag
    # for numbers that are converted to sympy integers).
    const = _Constants

    locals_for_eval: LocalsForEval = {
        "functions": dict(const.functions),
        "variables": dict(const.variables),
        "helpers": dict(const.helpers),
    }

    if allow_hidden:
        locals_for_eval["variables"].update(const.hidden_variables)
    if allow_complex:
        locals_for_eval["variables"].update(const.complex_variables)
        if allow_hidden:
            locals_for_eval["variables"].update(const.hidden_complex_variables)

    if allow_trig_functions:
        locals_for_eval["functions"].update(const.trig_functions)

    if allow_sets:
        locals_for_eval["functions"].update(const.set_functions)

    for name, (is_var, raw_name) in valid_names.items():
        if is_var:
            var_assumptions = (assumptions and assumptions.get(raw_name)) or {}
            locals_for_eval["variables"][name] = sympy.Symbol(name, **var_assumptions)
        else:
            locals_for_eval["functions"][name] = sympy.Function(name)

    # Do the conversion
    return evaluate_with_source(
        expr,
        locals_for_eval,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        simplify_expression=simplify_expression,
    )


def point_to_error(expr: str, ind: int, w: int = 5) -> str:
    """Generate a string with a pointer to error in expr with index ind.

    If ind is -1, returns the full expression without a caret pointer.

    Returns:
        A string with the error location in the expression.
    """
    if ind == -1:
        return html.escape(expr)

    w_left: str = " " * (ind - max(0, ind - w))
    w_right: str = " " * (min(ind + w, len(expr)) - ind)
    initial: str = html.escape(expr[ind - len(w_left) : ind + len(w_right)])
    return f"{initial}\n{w_left}^{w_right}"


def find_symbol_offset(expr: str, symbol: str) -> int:
    """Return an approximate offset for symbol in expr for caret rendering."""
    pattern = re.compile(rf"(?<!\w){re.escape(symbol)}(?!\w)")
    ind = -1
    for match in pattern.finditer(expr):
        ind = match.start()
    if ind != -1:
        return ind
    return expr.rfind(symbol)


_TYPE_ERROR_OPERATOR_PATTERN = re.compile(
    r"(unsupported operand type\(s\)|wrong number of arguments) for (?P<operator>[^:]+):"
)


def _find_type_error_offset(expr: str, offsets: list[int], exc: TypeError) -> int:
    """Return an approximate offset for a SymPy TypeError in expr."""
    match = _TYPE_ERROR_OPERATOR_PATTERN.search(str(exc))
    if match is None:
        return -1

    # for some TypeErrors, both the op and magic-method are provided, e.g `...for ** or pow():...`
    # see https://chromium.googlesource.com/external/github.com/python/cpython/+/refs/tags/v3.7.17/Objects/abstract.c
    # line 925 for an example.
    candidate_operators = match.group("operator").replace("()", "").split(" or ")
    # account for de-sugaring
    candidate_operators.extend(
        alias
        for alias, transformed_operator in _Constants.set_operator_desugars.items()
        if transformed_operator in candidate_operators
    )

    for candidate in candidate_operators:
        ind = find_symbol_offset(expr, candidate)
        if ind != -1:
            return offsets[ind]

    return -1


def sympy_to_json(
    a: sympy.Expr | sympy.Set,
    *,
    allow_complex: bool = True,
    allow_trig_functions: bool = True,
    allow_sets: bool = False,
) -> SympyJson:
    """Convert a SymPy expression to a JSON-seralizable dictionary.

    Returns:
        A JSON-serializable representation of the SymPy expression.

    Raises:
        HasSetNotationError: If the expression is a set and `allow_sets` is `False`.
    """
    if isinstance(a, sympy.Set) and not allow_sets:
        raise HasSetNotationError

    const = _Constants

    # Get list of variables in the sympy expression
    variables = list(map(str, a.free_symbols))

    # Get reserved variables for custom function parsing
    reserved = get_builtin_constants(
        allow_complex=allow_complex, allow_hidden=True
    ) | get_builtin_functions(
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
    )

    # Apply substitutions for hidden variables
    a_sub = a.subs([
        (val, sympy.symbols(key)) for key, val in const.hidden_variables.items()
    ])
    if allow_complex:
        a_sub = a_sub.subs([
            (val, sympy.symbols(key))
            for key, val in const.hidden_complex_variables.items()
        ])

    assumptions_dict = {
        str(variable): variable.assumptions0 for variable in a.free_symbols
    }

    # Don't check for conflicts here, that happens in parsing.
    functions_set = {str(func_obj.func) for func_obj in a.atoms(sympy.Function)}
    custom_functions = list(functions_set - reserved)

    return {
        "_type": "sympy",
        "_value": _SympyJsonStrPrinter().doprint(a_sub),
        "_variables": variables,
        "_assumptions": assumptions_dict,
        "_custom_functions": custom_functions,
    }


def json_to_sympy(
    sympy_expr_dict: SympyJson,
    *,
    allow_sets: bool = False,
    allow_complex: bool = True,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
) -> sympy.Expr:
    """Convert a json-seralizable dictionary created by [sympy_to_json][prairielearn.sympy_utils.sympy_to_json] to a SymPy expression.

    Returns:
        A SymPy expression.

    Raises:
        ValueError: If the input is not a valid SymPy JSON dict.
    """
    if "_type" not in sympy_expr_dict:
        raise ValueError("json must have key _type for conversion to sympy")
    if sympy_expr_dict["_type"] != "sympy":
        raise ValueError('json must have _type == "sympy" for conversion to sympy')
    if "_value" not in sympy_expr_dict:
        raise ValueError("json must have key _value for conversion to sympy")
    if "_variables" not in sympy_expr_dict:
        sympy_expr_dict["_variables"] = None

    return convert_string_to_sympy(
        sympy_expr_dict["_value"],
        sympy_expr_dict["_variables"],
        allow_hidden=True,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
        simplify_expression=simplify_expression,
        custom_functions=sympy_expr_dict.get("_custom_functions"),
        assumptions=sympy_expr_dict.get("_assumptions"),
    )


def try_parse_string_as_sympy(
    expr: str,
    variables: Iterable[str] | None,
    *,
    allow_complex: bool = False,
    allow_hidden: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: list[str] | None = None,
    imaginary_unit: str | None = None,
    simplify_expression: bool = True,
    assumptions: AssumptionsDictT | None = None,
) -> SympyParseResult:
    """Try to parse expr as a SymPy expression.

    Returns:
        A parsed SymPy expression on success, or a formatted error message on failure.

    Example::

        result = try_parse_string_as_sympy("x + 1", ["x"])
        if isinstance(result, SympyParseFailure):
            print(result.error)
        else:
            print(result.expr)
    """
    try:
        expr_parsed = convert_string_to_sympy(
            expr,
            variables,
            allow_hidden=allow_hidden,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig_functions,
            custom_functions=custom_functions,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
        )
    except HasFloatError as exc:
        return SympyParseFailure(
            f"Your answer contains the floating-point number {exc.n}. "
            f"All numbers must be expressed as integers (or ratios of integers)."
        )
    except HasComplexError:
        err_string = [
            "Your answer contains a complex number. ",
            "All numbers must be expressed as integers (or ratios of integers). ",
        ]

        if allow_complex:
            err_string.append(
                "To include a complex number in your expression, write it as the product "
                "of an integer with the imaginary unit <code>i</code> or <code>j</code>."
            )

        return SympyParseFailure("".join(err_string))
    except HasSetNotationError:
        return SympyParseFailure(
            "Your answer contains set notation, but set notation is not allowed for this question."
        )
    except HasInvalidExpressionError as exc:
        return SympyParseFailure(
            f"Your answer has an invalid expression. "
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasInvalidFunctionError as exc:
        return SympyParseFailure(
            f'Your answer calls an invalid function "{exc.text}". '
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except FunctionNameWithoutArgumentsError as exc:
        return SympyParseFailure(
            f'Your answer mentions the function "{exc.text}" without '
            "applying it to anything. "
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasInvalidSymbolError as exc:
        return SympyParseFailure(
            f'Your answer refers to an invalid symbol "{exc.symbol}". '
            f"<br><br><pre>{point_to_error(expr, find_symbol_offset(expr, exc.symbol))}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasArgumentTypeError as exc:
        error_text = (
            f"Your answer provides the wrong types to {exc.fn}. "
            f"It was expecting {exc.format_allowable_types()}, but got a {exc.got} "
            f"for argument #{exc.arg_idx + 1} instead."
        )
        if exc.offset != -1:
            return SympyParseFailure(
                f"{error_text} <br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
                "Note that the location of the syntax error is approximate."
            )
        return SympyParseFailure(error_text)
    except HasFunctionArityError as exc:
        error_text = f"Your answer provides the wrong number of arguments to '{exc.fn}', expected {exc.expected}."
        if exc.offset != -1:
            return SympyParseFailure(
                f"{error_text} <br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
                "Note that the location of the syntax error is approximate."
            )
        return SympyParseFailure(error_text)
    except HasParseError as exc:
        # Special case where there is no error offset to point at. In practice, this is almost always a missing closing
        # parenthesis that SymPy only catches at the end of parsing, so try to give a slightly more helpful error message.
        if exc.offset == -1:
            return SympyParseFailure(
                "Your answer has a syntax error. "
                "This issue might be caused by mismatched parentheses or some other misplaced symbol."
            )
        return SympyParseFailure(
            f"Your answer has a syntax error. "
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasEscapeError as exc:
        return SympyParseFailure(
            f'Your answer must not contain the character "\\". '
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasCommentError as exc:
        return SympyParseFailure(
            f'Your answer must not contain the character "#". '
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasConflictingVariableError as exc:
        return SympyParseFailure(
            f"Question configuration error: {exc}. "
            "The variable list contains a name that conflicts with a built-in constant. "
            "Please contact the course staff."
        )
    except HasConflictingFunctionError as exc:
        return SympyParseFailure(
            f"Question configuration error: {exc}. "
            "The custom function list contains a name that conflicts with a built-in function. "
            "Please contact the course staff."
        )
    except HasInvalidAssumptionError as exc:
        return SympyParseFailure(
            f"Question configuration error: {exc}. Please contact the course staff."
        )
    except Exception as exc:
        return SympyParseFailure(
            f"Unexpected error: {exc}. Please contact the course staff."
        )

    # If complex numbers are not allowed, raise error if expression has the imaginary unit
    if (
        (not allow_complex)
        and (imaginary_unit is not None)
        and (expr_parsed.has(sympy.I))
    ):
        expr_parsed = expr_parsed.subs(sympy.I, sympy.Symbol(imaginary_unit))
        return SympyParseFailure(
            "Your answer was simplified to this, which contains a complex number "
            f"(denoted ${imaginary_unit}$): $${sympy.latex(expr_parsed)}$$"
        )

    return SympyParseSuccess(expr_parsed)


def validate_string_as_sympy(
    expr: str,
    variables: Iterable[str] | None,
    *,
    allow_sets: bool = False,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: list[str] | None = None,
    imaginary_unit: str | None = None,
    simplify_expression: bool = True,
    assumptions: AssumptionsDictT | None = None,
) -> str | None:
    """Try to parse expr as a SymPy expression.

    Returns:
        `None` if the expression is valid, and an error message otherwise.
    """
    result = try_parse_string_as_sympy(
        expr,
        variables,
        allow_hidden=allow_hidden,
        allow_sets=allow_sets,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig_functions,
        custom_functions=custom_functions,
        imaginary_unit=imaginary_unit,
        simplify_expression=simplify_expression,
        assumptions=assumptions,
    )

    if isinstance(result, SympyParseFailure):
        return result.error

    return None


def get_items_list(items_string: str | None) -> list[str]:
    """Return a list of items from a comma-separated string."""
    if items_string is None:
        return []

    return list(map(str.strip, items_string.split(",")))


def _set_literal_transformation(
    tokens: list[TOKEN], _local_dict: DICT, _global_dict: DICT
) -> list[TOKEN]:
    """A SymPy token transformation that rewrites set literals to FiniteSet calls."""
    if not tokens:
        return tokens

    set_start = (NAME, "FiniteSet"), (OP, "(")
    set_end = (OP, ")")
    out: list[TOKEN] = []
    depth = 0

    for token in tokens:
        _, text = token
        if text == "{":
            out.extend(set_start)
            depth += 1
        elif text == "}":
            if depth <= 0:
                raise TokenError("too many closing braces")
            out.append(set_end)
            depth -= 1
        else:
            out.append(token)

    if depth != 0:
        raise TokenError("set notation is incomplete")

    return out


def _try_rewrite_interval_literal(
    tokens: list[TOKEN], start_index: int
) -> tuple[tuple[TOKEN, ...] | None, int]:
    _, start_text = tokens[start_index]
    if start_text not in ("(", "["):
        return None, start_index

    set_literal_openers = {"(", "[", "{"}
    set_literal_closers = {")", "]", "}"}

    def _seek_comma_or_closer(start_index: int) -> tuple[bool, list[TOKEN], int, TOKEN]:
        operand, depth = [], 0
        for i, token in enumerate(tokens[start_index:], start=start_index):
            _, text = token
            if text in set_literal_openers:
                depth += 1
            elif text in set_literal_closers:
                if depth == 0:
                    return True, operand, i, token
                depth -= 1
            elif text == "," and depth == 0:
                return False, operand, i, token
            operand.append(token)
        raise TokenError("interval notation is incomplete")

    set_notation_only_tokens = {"[", "]", "{", "}", "|", "&"}
    set_fn_names = _Constants.set_functions.keys() | set_notation_only_tokens

    def _contains_set_notation(tokens: list[TOKEN]) -> bool:
        return any((typ == NAME and text in set_fn_names) for typ, text in tokens)

    # consume until the first top-level comma or closing bracket.
    closed, left_side, mid_index, _comma = _seek_comma_or_closer(start_index + 1)
    if closed:
        return None, start_index

    # consume until the matching top-level closing bracket.
    closed, right_side, end_index, (_, end_text) = _seek_comma_or_closer(mid_index + 1)
    if not closed:
        raise TokenError("interval contains more than one separator")

    if _contains_set_notation(left_side) or _contains_set_notation(right_side):
        raise TokenError("interval endpoints cannot contain set notation")

    return (
        (NAME, "Interval"),
        (OP, "("),
        *left_side,
        (OP, ","),
        *right_side,
        (OP, ","),
        (NAME, "True" if start_text == "(" else "False"),
        (OP, ","),
        (NAME, "True" if end_text == ")" else "False"),
        (OP, ")"),
    ), end_index


def _err_on_transform(trans: TRANS, exc: type[BaseSympyError]) -> TRANS:
    @wraps(trans)
    def _raise_on_transform(
        in_tokens: list[TOKEN], local_dict: DICT, global_dict: DICT
    ) -> list[TOKEN]:
        out_tokens = trans(in_tokens, local_dict, global_dict)
        if out_tokens != in_tokens:
            raise exc()
        return out_tokens

    return _raise_on_transform


def _interval_transformation(
    tokens: list[TOKEN], _local_dict: DICT, _global_dict: DICT
) -> list[TOKEN]:
    """A SymPy token transformation that interprets mathematical intervals like `(-inf, 0]` or `[pi/2, pi]`

    Returns:
        A transformed sequence of SymPy tokens.
    """
    if not tokens:
        return tokens
    result = []
    prev = None
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if not prev or prev[0] != NAME:
            rewritten_tokens, end_index = _try_rewrite_interval_literal(tokens, i)
            if rewritten_tokens is not None:
                result.extend(rewritten_tokens)
                prev = tokens[end_index]
                i = end_index + 1
                continue

        result.append(token)
        prev = token
        i += 1
    return result


def _split_mangled_binop(binops: Sequence[str], text: str) -> tuple[str, str] | None:
    r"""Returns (op, num_text) if text is <op>\d+"""
    if text not in binops:
        stripped = text.rstrip(string.digits)
        if stripped in binops:
            return stripped, text[len(stripped) :]
    return None


def _unmangle_infix_binops_transformation(binop_literals: Iterable[str]) -> TRANS:
    """Return a token transform that splits infix operator names from suffix digits.

    SymPy's tokenizer treats strings like ``U2`` or ``cup3`` as a single ``NAME``
    token. PrairieLearn uses this transform to recover the operator literal and
    the trailing numeric suffix as separate tokens, so later parsing steps can
    interpret set-union/set-intersection input from the formula editor without
    exposing parser internals to students.
    """
    bin_lit_set = tuple(binop_literals)

    def _infix_binop_unmangler(
        tokens: list[TOKEN], _local_dict: DICT, _global_dict: DICT
    ) -> list[TOKEN]:
        out = []
        for typ, text in tokens:
            if typ == NAME:
                split = _split_mangled_binop(bin_lit_set, text)
                if split is not None:
                    op, num = split
                    out.extend(((OP, op), (NUMBER, num)))
                    continue
            out.append((typ, text))
        return out

    return _infix_binop_unmangler


def _set_operation_transformation(
    tokens: list[TOKEN], _local_dict: DICT, _global_dict: DICT
) -> list[TOKEN]:
    """A SymPy token transformation that de-sugars set union/intersection.

    Returns:
        A transformed sequence of SymPy tokens.
    """
    set_ops = _Constants.set_operator_desugars
    return [
        (OP, set_ops[text]) if text in set_ops else (typ, text) for typ, text in tokens
    ]


def get_builtin_constants(
    *, allow_complex: bool = False, allow_hidden: bool = True
) -> set[str]:
    """Return the set of built-in constant names.

    Parameters:
        allow_complex: Whether to include complex number constants (i, j).
        allow_hidden: Whether to include sympy's longer name for constants.

    Returns:
        A set of built-in constant names.
    """
    const = _Constants
    names = set(const.variables.keys())
    if allow_complex:
        names |= const.complex_variables.keys()
    if allow_hidden:
        names.update(const.hidden_variables.keys())
    if allow_complex and allow_hidden:
        names.update(const.hidden_complex_variables.keys())
    return names


def get_builtin_functions(
    *, allow_trig_functions: bool = True, allow_sets: bool = False
) -> set[str]:
    """Return the set of built-in function names.

    Parameters:
        allow_trig_functions: Whether to include trigonometric functions.
        allow_sets: Whether to include set operators and constructors.

    Returns:
        A set of built-in function names.
    """
    const = _Constants
    names = const.functions.keys() | const.helpers.keys()
    if allow_trig_functions:
        names |= const.trig_functions.keys()
    if allow_sets:
        names |= const.set_functions.keys()
        names |= const.set_operators.keys()
    return names


def _build_name_conflict_data(
    variables: Iterable[str],
    custom_functions: Iterable[str],
    *,
    allow_complex: bool,
    allow_hidden: bool,
    allow_trig_functions: bool,
    allow_sets: bool,
) -> tuple[list[str], list[str], dict[str, tuple[bool, str]]]:
    """Validate that user-specified names don't conflict with built-in constants or functions.

    Parameters:
        element_name: Name of the element (for error messages).
        variables: User-specified variable names.
        custom_functions: User-specified custom function names.
        allow_complex: Whether complex constants (i, j) are available.
        allow_hidden: Whether sympy's long-form names for constants are available.
        allow_sets: Whether set operations are available.
        allow_trig_functions: Whether trig functions are available.

    Returns:
        A list of (var_names, fun_names, valid_sanitized_names) where var/fun_names conflict
        with builtins or themselves and valid_sanitized_names maps `sanitized_unique_name ->
        (was_variable, unsanitized)`.
    """
    builtins = get_builtin_functions(
        allow_trig_functions=allow_trig_functions,
        allow_sets=allow_sets,
    ) | get_builtin_constants(
        allow_complex=allow_complex,
        allow_hidden=allow_hidden,
    )
    set_ops = tuple(_Constants.set_operators.keys())

    def _conflicts(name: str) -> bool:
        if name in builtins:
            return True
        return allow_sets and _split_mangled_binop(set_ops, name) is not None

    valid_names: dict[str, tuple[bool, str]] = {}
    conflict_vars: list[str] = []
    conflict_fns: list[str] = []

    for raw in variables:
        sanitized = greek_unicode_transform(raw)
        if sanitized in valid_names or _conflicts(sanitized):
            conflict_vars.append(raw)
        else:
            valid_names[sanitized] = (True, raw)

    for raw in custom_functions:
        sanitized = greek_unicode_transform(raw)
        if sanitized in valid_names or _conflicts(sanitized):
            conflict_fns.append(raw)
        else:
            valid_names[sanitized] = (False, raw)

    return conflict_vars, conflict_fns, valid_names


def validate_names_for_conflicts(
    element_name: str,
    variables: list[str],
    custom_functions: list[str],
    *,
    allow_complex: bool = False,
    allow_hidden_variables: bool = True,
    allow_trig_functions: bool = True,
    allow_sets: bool = False,
) -> None:
    """Validate that user-specified names don't conflict with built-in constants or functions.

    Parameters:
        element_name: Name of the element (for error messages).
        variables: User-specified variable names.
        custom_functions: User-specified custom function names.
        allow_complex: Whether complex constants (i, j) are available.
        allow_hidden_variables: Whether sympy's long-form names for constants are available.
        allow_sets: Whether set operations are available.
        allow_trig_functions: Whether trig functions are available.

    Raises:
        ValueError: If any names conflict with built-ins.
    """
    v_conflicts, f_conflicts, _valid = _build_name_conflict_data(
        variables,
        custom_functions,
        allow_complex=allow_complex,
        allow_hidden=allow_hidden_variables,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
    )
    conflicts = v_conflicts + f_conflicts
    if conflicts:
        raise ValueError(
            f'Element "{element_name}" specifies names that conflict with built-ins: '
            f"{', '.join(conflicts)}. These are automatically available and should not be listed."
        )


# From https://gist.github.com/beniwohli/765262, with a typo fix for lambda/Lambda
_GREEK_ALPHABET = {
    0x0391: "Alpha",
    0x0392: "Beta",
    0x0393: "Gamma",
    0x0394: "Delta",
    0x0395: "Epsilon",
    0x0396: "Zeta",
    0x0397: "Eta",
    0x0398: "Theta",
    0x0399: "Iota",
    0x039A: "Kappa",
    0x039B: "Lambda",
    0x039C: "Mu",
    0x039D: "Nu",
    0x039E: "Xi",
    0x039F: "Omicron",
    0x03A0: "Pi",
    0x03A1: "Rho",
    0x03A3: "Sigma",
    0x03A4: "Tau",
    0x03A5: "Upsilon",
    0x03A6: "Phi",
    0x03A7: "Chi",
    0x03A8: "Psi",
    0x03A9: "Omega",
    0x03B1: "alpha",
    0x03B2: "beta",
    0x03B3: "gamma",
    0x03B4: "delta",
    0x03B5: "epsilon",
    0x03B6: "zeta",
    0x03B7: "eta",
    0x03B8: "theta",
    0x03B9: "iota",
    0x03BA: "kappa",
    0x03BB: "lambda",
    0x03BC: "mu",
    0x03BD: "nu",
    0x03BE: "xi",
    0x03BF: "omicron",
    0x03C0: "pi",
    0x03C1: "rho",
    0x03C3: "sigma",
    0x03C4: "tau",
    0x03C5: "upsilon",
    0x03C6: "phi",
    0x03C7: "chi",
    0x03C8: "psi",
    0x03C9: "omega",
}


def greek_unicode_transform(input_str: str) -> str:
    """Return input_str where all unicode greek letters are replaced by their spelled-out english names."""
    return input_str.translate(_GREEK_ALPHABET)
