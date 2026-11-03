"""Utility functions for parsing and evaluating SymPy expressions.

```python
from prairielearn.sympy_utils import ...
```
"""

import ast
import html
import re
import string
import unicodedata
from collections import deque
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from enum import Enum
from functools import lru_cache, wraps
from io import StringIO
from tokenize import NAME, NUMBER, OP, TokenError, generate_tokens
from types import CodeType
from types import MappingProxyType as FrozenDict
from typing import (
    Any,
    Final,
    Literal,
    Never,
    NotRequired,
    TypedDict,
    TypeGuard,
    cast,
)

import sympy
from sympy.parsing import sympy_parser
from sympy.parsing.sympy_parser import DICT, TOKEN, TRANS
from sympy.printing.str import StrPrinter

from prairielearn.internal import sympy_constants, sympy_source
from prairielearn.misc_utils import full_unidecode

STANDARD_OPERATORS = sympy_constants.standard_operators
SET_NOTATION_OPERATORS = sympy_constants.set_notation_operators
# Compatibility alias for code that previously accessed the container class.
_Constants = sympy_constants
SYMPY_PARSE_ERROR_WITHOUT_LOCATION = (
    "Your answer has a syntax error. "
    "This issue might be caused by mismatched parentheses or some other misplaced symbol."
)
SYMPY_EVALUATION_ERROR_WITHOUT_LOCATION = (
    "Your answer contains an invalid expression that could not be evaluated. "
    "Check that each function and operator is used with valid arguments."
)

SympyMapT = dict[str, sympy.Basic | complex]
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


type SympyParseResult = SympyParseSuccess | SympyParseFailure


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


class _SympyJsonStrPrinter(StrPrinter):
    """String printer that keeps set notation parseable by avoiding banned ast nodes.

    Callers must deserialize with `allow_sets=True` or the literal forms will be rejected.
    """

    def _print_EmptySet(self, expr: sympy.Set) -> str:  # pyright: ignore[reportIncompatibleMethodOverride] # ruff:ignore[unused-method-argument, invalid-function-name]
        return "{}"

    def _print_Interval(self, i: sympy.Interval) -> str:  # ruff:ignore[invalid-function-name]
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
    offset: int | None = None


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


_SET_OPERATION_FUNCTIONS: Final[FrozenDict[type[ast.operator], str]] = FrozenDict({
    ast.Add: "Union",
    ast.Sub: "Complement",
    ast.BitAnd: "Intersection",
    ast.BitOr: "Union",
})


def _allows_legacy_custom_function_override(name: str) -> bool:
    return name in sympy_constants.legacy_custom_function_overrides


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


@dataclass
class HasFunctionArityError(BaseSympyError):
    fn: str
    provided: int
    expected: str
    offset: int = -1


@dataclass(frozen=True, slots=True)
class _IndexEvidence:
    index: int


@dataclass(frozen=True, slots=True)
class _TokenEvidence:
    token: str


type _ErrorEvidence = _IndexEvidence | _TokenEvidence | None


@dataclass(frozen=True, slots=True)
class _LocalizedSympyError(Exception):
    error: BaseSympyError
    source: sympy_source.SourceText
    evidence: _ErrorEvidence = None
    evaluation_failure: bool = False
    cause: BaseException | None = None


def _builtin_function_arities(name: str) -> tuple[int, ...] | None:
    """Return the argument counts a built-in function accepts, or None if any count is allowed."""
    if name in sympy_constants.builtin_function_arity_overrides:
        return sympy_constants.builtin_function_arity_overrides[name]
    function = sympy_constants.functions.get(
        name
    ) or sympy_constants.trig_functions.get(name)
    nargs = getattr(function, "nargs", None)
    if isinstance(nargs, sympy.FiniteSet):
        return tuple(sorted(int(cast(sympy.Integer, arity)) for arity in nargs))
    return None


class CheckAST(ast.NodeVisitor):
    whitelist: ASTWhiteListT
    variables: SympyMapT
    functions: SympyFunctionMapT
    resolved_names: Mapping[str, Any]
    __parents: dict[int, ast.AST]
    __set_operations: set[ast.BinOp]
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
        resolved_names: Mapping[str, Any] | None = None,
    ) -> None:
        self.whitelist = whitelist
        self.variables = variables
        self.functions = functions
        self.resolved_names = variables if resolved_names is None else resolved_names
        self.__parents = {}
        self.__set_operations = set()
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
        self._check_expression(expr)

    def _check_expression(
        self, expr: str
    ) -> tuple[ast.Expression, frozenset[ast.BinOp]]:
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
            return root, frozenset(self.__set_operations)
        finally:
            self.__parents = {}
            self.__set_operations = set()
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
        if not isinstance(node.ctx, ast.Load) or self.is_name_of_function(node):
            return self._set_type(node, None)

        is_variable = node.id in self.variables
        if not is_variable and node.id in self.functions:
            err_node = self.get_parent_with_location(node)
            raise FunctionNameWithoutArgumentsError(err_node.col_offset, err_node.id)

        if is_variable or node.id in self.resolved_names:
            value = self.resolved_names.get(node.id, self.variables.get(node.id))
            if self.allow_sets and isinstance(value, sympy.Set):
                return self._set_type(node, ASTSympyType.SET)
            if isinstance(value, (sympy.Expr, complex)):
                return self._set_type(node, ASTSympyType.SCALAR)

        return self._set_type(node, None)

    def visit_Call(self, node: ast.Call) -> ASTSympyType | None:
        if isinstance(node.func, ast.Name) and node.func.id not in self.functions:
            err_node = self.get_parent_with_location(node)
            raise HasInvalidFunctionError(err_node.col_offset, err_node.func.id)

        self.generic_visit(node)

        if not isinstance(node.func, ast.Name):
            return self._set_type(node, None)

        name, args = node.func.id, node.args
        resolved_function = self.resolved_names.get(name)
        match name:
            case "Symbol":
                return self._set_type(node, None)
            case "Integer" | "Float":
                overloads = [ASTSympyType.SCALAR], [ASTSympyType.STRING]
                self._enforce_signature(name, args, *overloads)
                return self._set_type(node, ASTSympyType.SCALAR)
            case fn if (
                self.allow_sets
                and fn in sympy_constants.set_functions
                and resolved_function == sympy_constants.set_functions[fn]
            ):
                return self._set_type(node, self._infer_set_function_type(name, args))
            case fn if (
                fn in sympy_constants.functions or fn in sympy_constants.trig_functions
            ):
                arities = _builtin_function_arities(fn) or (len(args),)
                self._enforce_signature(
                    fn, args, *(arity * [ASTSympyType.SCALAR] for arity in arities)
                )
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
        if (
            inferred_type == ASTSympyType.SET
            and type(node.op) in _SET_OPERATION_FUNCTIONS
        ):
            self.__set_operations.add(node)
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
            case "Complement":
                self._enforce_signature(name, args, 2 * [ASTSympyType.SET])
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
                left_type, right_type = self._enforce_signature(
                    op, (left, right), 2 * [ASTSympyType.SET]
                )
                return left_type or right_type
            case "-" | "+":
                overloads = (2 * [ASTSympyType.SET]), (2 * [ASTSympyType.SCALAR])
                left_type, right_type = self._enforce_signature(
                    op, (left, right), *overloads
                )
                return left_type or right_type
            case "**" | "*" | "/" | "%":
                self._enforce_signature(op, (left, right), 2 * [ASTSympyType.SCALAR])
                return ASTSympyType.SCALAR
            case _:
                lt, rt = self._get_type(left), self._get_type(right)
                if lt is None or rt is None or lt == rt:
                    return lt or rt
                return None


def _ast_check_str(
    expr: str,
    locals_for_eval: LocalsForEval,
    *,
    allow_sets: bool = False,
    resolved_names: Mapping[str, Any] | None = None,
) -> tuple[ast.Expression, frozenset[ast.BinOp]]:
    """Check an expression and return its parsed AST and validated set operations."""
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

    if resolved_names is None:
        local_names = {
            name: value
            for values in locals_for_eval.values()
            for name, value in cast(Mapping[str, Any], values).items()
        }
        resolved_names = sympy_constants.sympy_globals | local_names

    return CheckAST(
        whitelist,
        locals_for_eval["variables"],
        locals_for_eval["helpers"] | locals_for_eval["functions"],
        allow_sets=allow_sets,
        resolved_names=resolved_names,
    )._check_expression(expr)


def ast_check_str(
    expr: str, locals_for_eval: LocalsForEval, *, allow_sets: bool = False
) -> None:
    """Check the AST of the expression for security, whitelisting only certain nodes.

    This prevents the user from executing arbitrary code through `eval_expr`.
    """
    _ast_check_str(expr, locals_for_eval, allow_sets=allow_sets)


class _SetOperationTransformer(ast.NodeTransformer):
    """Rewrite only binary operations validated as set operations."""

    def __init__(
        self,
        set_operations: frozenset[ast.BinOp],
        occupied_names: Iterable[str],
    ) -> None:
        self._set_operations = set_operations
        self._function_names: dict[type[ast.operator], str] = {}
        self.evaluation_locals: SympyFunctionMapT = {}

        used_names = set(occupied_names)
        protected_names: dict[str, str] = {}
        for operation_type in {type(node.op) for node in set_operations}:
            function_name = _SET_OPERATION_FUNCTIONS[operation_type]
            protected_name = protected_names.get(function_name)
            if protected_name is None:
                protected_name = f"_pl_set_operation_{function_name}"
                while protected_name in used_names:
                    protected_name += "_"
                used_names.add(protected_name)
                protected_names[function_name] = protected_name
                self.evaluation_locals[protected_name] = sympy_constants.set_functions[
                    function_name
                ]
            self._function_names[operation_type] = protected_name

    def visit_BinOp(self, node: ast.BinOp) -> ast.AST:
        node = cast(ast.BinOp, self.generic_visit(node))
        if node not in self._set_operations:
            return node

        function_name = self._function_names[type(node.op)]
        return ast.copy_location(
            ast.Call(
                func=ast.Name(id=function_name, ctx=ast.Load()),
                args=[node.left, node.right],
                keywords=[],
            ),
            node,
        )


def sympy_check(
    expr: sympy.Expr,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool,
    allow_sets: bool,
    allow_extra_symbols: bool = False,
    # True would ensure semantic checks by default but break compatibility.
    check_evaluated_complex: bool = False,
) -> None:
    """Check the SymPy expression for complex numbers, invalid symbols, and floats."""
    valid_symbols = set().union(
        *(cast(SympyMapT, inner_dict).keys() for inner_dict in locals_for_eval.values())
    )

    def check_nodes(
        root: sympy.Basic, *, check_structure: bool, check_complex: bool
    ) -> None:
        checked_nodes: set[sympy.Basic] | None = (
            set() if check_evaluated_complex else None
        )
        work_stack: deque[sympy.Basic] = deque([root])

        while work_stack:
            item = work_stack.pop()
            if checked_nodes is not None:
                if item in checked_nodes:
                    continue
                checked_nodes.add(item)

            if check_structure:
                # Avoid str(item) on every node: printing each subtree is quadratic in
                # the size of the expression and dominates parse time.
                if (
                    not allow_extra_symbols
                    and isinstance(item, sympy.Symbol)
                    and (str_item := str(item)) not in valid_symbols
                ):
                    raise HasInvalidSymbolError(str_item)
                if isinstance(item, sympy.Float):
                    raise HasFloatError(float(str(item)))
                if not allow_sets and isinstance(item, sympy.Set):
                    raise HasSetNotationError
            if check_complex and not allow_complex and _is_disallowed_complex(item):
                raise HasComplexError("complex values not allowed")

            work_stack.extend(item.args)

    # SymPy's assumptions can be inconsistent for unevaluated arithmetic trees.
    # When checking an evaluated copy, only use the original tree for structural
    # validation so that it remains available for display without determining
    # whether the expression is complex.
    check_nodes(
        expr,
        check_structure=True,
        check_complex=not check_evaluated_complex,
    )

    if check_evaluated_complex:
        # Reevaluate the existing tree without reparsing, while preserving the
        # unevaluated result returned for display.
        try:
            evaluated_expr = expr.doit(deep=True)
        except Exception as exc:
            raise BaseSympyError from exc
        check_nodes(evaluated_expr, check_structure=False, check_complex=True)


def _is_disallowed_complex(item: sympy.Basic) -> bool:
    """Return whether an expression is a finite complex value."""
    if item is sympy.I:
        return True

    # The is_finite guard excludes zoo (complex infinity from 1/0) and similar
    # non-finite values, which aren't complex in the student-input sense.
    # is_extended_real can trigger internal SymPy bugs on certain unevaluated
    # expressions (e.g. sec(0) with evaluateFalse).
    try:
        return (
            item.is_extended_real is False
            and getattr(item, "is_finite", None) is not False
        )
    except AttributeError:
        return False


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


def _normalize_unicode_source(
    source: sympy_source.SourceText, *, formula_editor: bool = False
) -> sympy_source.SourceText:
    """Normalize Unicode while retaining the raw offset of every output character."""
    const = sympy_constants
    normalized_tokens: list[sympy_source.SourceToken] = []
    for token in source.tokens:
        char = token.text
        normalized_char = char
        if char in const.unicode_operators:
            normalized_char = const.unicode_operators[char]
        elif char in const.plus_minus_operators or (
            not char.isascii()
            and unicodedata.decomposition(char).startswith(("<super>", "<sub>"))
        ):
            # unidecode would turn "±" into "+-" and "x²" into "x2" (i.e. 2*x). The
            # formula editor writes exponents and subscripts with "^" and "_".
            raise HasInvalidSymbolError(char, token.raw_offset)
        # Single-char codepoints only; multi-char keys like "cup" are unidecoded
        # character-by-character (a no-op for ASCII).
        elif char not in const.set_operators:
            greek_normalized = greek_unicode_transform(char)
            normalized_char = full_unidecode(greek_normalized)
            # unidecode uses "[?]" for characters it doesn't know, which would
            # otherwise be misreported as set notation.
            if normalized_char == "[?]" and char != normalized_char:
                raise HasInvalidSymbolError(char, token.raw_offset)
            if formula_editor and greek_normalized != char:
                normalized_char = f" {' '.join(normalized_char)} "

        normalized_tokens.extend(token.rewrite(normalized_char))
    return source.replace(normalized_tokens)


# The lookahead allows overlapping pairs, so a Unicode sign after "**" is checked.
_MULTIPLICATION_PAIR_PATTERN = r"(?=(?P<left>\*)\s*(?P<right>\*))"


def _validate_multiplication(source: sympy_source.SourceText) -> None:
    """Reject multiplication signs that normalization would turn into exponentiation."""
    for match in re.finditer(_MULTIPLICATION_PAIR_PATTERN, source.text):
        left_offset = source.tokens[match.start("left")].raw_offset
        right_offset = source.tokens[match.start("right")].raw_offset
        if source.raw_text[right_offset] != "*":
            raise HasInvalidExpressionError(right_offset)
        if source.raw_text[left_offset] != "*":
            raise HasInvalidExpressionError(left_offset)
        if match.start("right") > match.end("left"):
            raise HasInvalidExpressionError(left_offset)


def _validate_adjacent_numbers(source: sympy_source.SourceText) -> None:
    """Reject numeric tokens that implicit multiplication would silently combine."""
    line_offsets = [0]
    for line in source.text.splitlines(keepends=True):
        line_offsets.append(line_offsets[-1] + len(line))

    previous_number_end: tuple[int, int] | None = None
    try:
        for token in generate_tokens(StringIO(source.text).readline):
            if token.type != NUMBER:
                previous_number_end = None
                continue

            if token.start == previous_number_end:
                row, column = token.start
                offset = line_offsets[row - 1] + column
                raise HasInvalidExpressionError(source.tokens[offset].raw_offset)

            previous_number_end = token.end
    except TokenError:
        # The normal parsing path will report incomplete token streams.
        return


def _rewrite_pattern_source(
    source: sympy_source.SourceText,
    pattern: re.Pattern[str],
    replacement: Callable[
        [re.Match[str], tuple[sympy_source.SourceToken, ...]],
        Iterable[sympy_source.SourceToken],
    ],
) -> sympy_source.SourceText:
    tokens: list[sympy_source.SourceToken] = []
    last_end = 0
    for match in pattern.finditer(source.text):
        tokens.extend(source.tokens[last_end : match.start()])
        tokens.extend(replacement(match, source.tokens[match.start() : match.end()]))
        last_end = match.end()
    tokens.extend(source.tokens[last_end:])
    return source.replace(tokens)


def _validate_and_rewrite_source(
    source: sympy_source.SourceText,
    *,
    allow_complex: bool,
    allow_sets: bool,
) -> sympy_source.SourceText:
    _validate_multiplication(source)

    for symbol in sympy_constants.plus_minus_operators:
        ind = source.text.find(symbol)
        if ind != -1:
            raise HasInvalidSymbolError(symbol, source.tokens[ind].raw_offset)

    ind = source.text.find("\\")
    if ind != -1:
        raise HasEscapeError(source.tokens[ind].raw_offset)
    ind = source.text.find("#")
    if ind != -1:
        raise HasCommentError(source.tokens[ind].raw_offset)
    if stars := re.search(r"\*{3,}", source.text):
        raise HasInvalidExpressionError(source.tokens[stars.start()].raw_offset)
    if not allow_sets and any(
        token in source.text
        for token in ("[", "]", "{", "}", "∪", "∩", "&", "|")  # ruff:ignore[ambiguous-unicode-character-string]
    ):
        raise HasSetNotationError

    source = _rewrite_pattern_source(
        source,
        re.compile(r"\^"),
        lambda _match, tokens: tokens[0].rewrite("**"),
    )
    source = _rewrite_pattern_source(
        source,
        re.compile(r"(\d)([eE])([+-])"),
        lambda match, tokens: (
            tokens[:1] + tokens[1].rewrite(f"*{match.group(2)}") + tokens[2:]
        ),
    )
    if not allow_complex:
        source = _rewrite_pattern_source(
            source,
            re.compile(r"(\d)([jJ])(?![a-zA-Z0-9])"),
            lambda match, tokens: tokens[:1] + tokens[1].rewrite(f"*{match.group(2)}"),
        )
    _validate_adjacent_numbers(source)
    return source


def _normalize_source(
    text: str, *, allow_complex: bool, allow_sets: bool
) -> sympy_source.SourceText:
    source = _normalize_unicode_source(sympy_source.SourceText.from_text(text))
    return _validate_and_rewrite_source(
        source,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )


def _token_at_offset(text: str, offset: int) -> str | None:
    if offset < 0 or offset >= len(text):
        return None
    if text[offset].isspace():
        return None
    if text[offset].isalnum() or text[offset] == "_":
        start = offset
        while start > 0 and (text[start - 1].isalnum() or text[start - 1] == "_"):
            start -= 1
        end = offset + 1
        while end < len(text) and (text[end].isalnum() or text[end] == "_"):
            end += 1
        return text[start:end]
    return text[offset]


def _default_error_evidence(error: BaseSympyError) -> _ErrorEvidence:
    if isinstance(error, (HasInvalidFunctionError, FunctionNameWithoutArgumentsError)):
        return _TokenEvidence(error.text)
    if isinstance(error, (HasArgumentTypeError, HasFunctionArityError)):
        return _TokenEvidence(error.fn)
    if isinstance(error, HasInvalidSymbolError):
        if error.offset is not None and error.offset >= 0:
            return _IndexEvidence(error.offset)
        return _TokenEvidence(error.symbol)
    if (
        isinstance(
            error,
            (
                HasInvalidExpressionError,
                HasParseError,
                HasEscapeError,
                HasCommentError,
                HasInvalidVariableError,
            ),
        )
        and error.offset >= 0
    ):
        return _IndexEvidence(error.offset)
    return None


def _ast_error_evidence(error: BaseSympyError, generated_code: str) -> _ErrorEvidence:
    if isinstance(error, (HasInvalidFunctionError, FunctionNameWithoutArgumentsError)):
        return _TokenEvidence(error.text)
    if isinstance(error, (HasArgumentTypeError, HasFunctionArityError)):
        return _TokenEvidence(error.fn)
    if isinstance(error, HasParseError) and isinstance(error.__cause__, SyntaxError):
        syntax_error = error.__cause__
        if syntax_error.text is not None and syntax_error.offset is not None:
            token = _token_at_offset(syntax_error.text, syntax_error.offset - 1)
            if token is not None:
                return _TokenEvidence(token)
        return None
    if isinstance(error, HasInvalidExpressionError):
        token = _token_at_offset(generated_code, error.offset)
        if token is not None:
            return _TokenEvidence(token)
    return None


def _raise_unwrapped(error: _LocalizedSympyError) -> Never:
    if error.cause is not None:
        raise error.error from error.cause
    raise error.error from None


def _evaluate_with_source(
    expr: str,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool = False,
    allow_sets: bool = False,
    simplify_expression: bool = True,
    allow_extra_symbols: bool = False,
    resolved_name_overrides: Mapping[str, Any] | None = None,
) -> tuple[sympy.Expr, str | CodeType]:
    """Evaluate a SymPy expression string with a given set of locals.

    Returns:
        A tuple of the SymPy expression and the code that was used to generate it.

    """
    source = _normalize_source(
        expr,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )
    try:
        return _evaluate_normalized_source(
            source,
            locals_for_eval,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            simplify_expression=simplify_expression,
            allow_extra_symbols=allow_extra_symbols,
            resolved_name_overrides=resolved_name_overrides,
        )
    except _LocalizedSympyError as exc:
        _raise_unwrapped(exc)


def _evaluate_normalized_source(
    source: sympy_source.SourceText,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool,
    allow_sets: bool,
    simplify_expression: bool,
    allow_extra_symbols: bool,
    resolved_name_overrides: Mapping[str, Any] | None = None,
) -> tuple[sympy.Expr, str | CodeType]:
    normalized_expr = source.text

    local_dict: DICT = {
        k: v
        for inner_dict in locals_for_eval.values()
        for k, v in cast(SympyMapT, inner_dict).items()
    }

    # Keep mutations made during one parse from affecting later parses.
    global_dict = dict(sympy_constants.sympy_globals)

    transformations = (
        *sympy_parser.standard_transformations,
        sympy_parser.implicit_multiplication_application,
    )
    if allow_sets:
        transformations = (
            _unmangle_infix_binops_transformation(sympy_constants.set_operators.keys()),
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
    parsed_locals_to_eval: LocalsForEval = {
        "functions": locals_for_eval["functions"].copy(),
        "variables": locals_for_eval["variables"].copy(),
        "helpers": locals_for_eval["helpers"].copy(),
    }

    # Add locals that appear after sympy stringification
    # This check is only for safety, so won't change what gets parsed
    parsed_locals_to_eval["functions"].update(
        Integer=sympy.Integer,
        Symbol=sympy.Symbol,
        Float=sympy.Float,
        Interval=sympy.Interval,
        Union=sympy.Union,
        Intersection=sympy.Intersection,
        Complement=sympy.Complement,
    )

    parsed_locals_to_eval["variables"].update(
        I=sympy.I,
        oo=sympy.oo,
    )

    try:
        resolved_names = global_dict | local_dict
        if resolved_name_overrides is not None:
            resolved_names.update(resolved_name_overrides)
        expression_ast, set_operations = _ast_check_str(
            code,
            parsed_locals_to_eval,
            allow_sets=allow_sets,
            resolved_names=resolved_names,
        )
    except BaseSympyError as exc:
        raise _LocalizedSympyError(
            exc,
            source,
            _ast_error_evidence(exc, code),
            cause=exc.__cause__,
        ) from None

    evaluation_code: str | CodeType = code
    if not simplify_expression:
        try:
            if allow_sets:
                set_operation_transformer = _SetOperationTransformer(
                    set_operations,
                    local_dict.keys() | global_dict.keys(),
                )
                expression_ast = cast(
                    ast.Expression,
                    set_operation_transformer.visit(expression_ast),
                )
                # These names are introduced after validating the user-provided AST so
                # custom functions cannot replace the generated set operations.
                local_dict.update(set_operation_transformer.evaluation_locals)
            expression_ast = cast(
                ast.Expression,
                sympy_parser.EvaluateFalseTransformer().visit(expression_ast),
            )
            evaluation_code = compile(
                ast.fix_missing_locations(expression_ast), "<string>", "eval"
            )
        except SyntaxError as exc:
            parse_error = HasParseError(exc.offset if exc.offset is not None else -1)
            evidence = None
            if exc.text is not None and exc.offset is not None:
                token = _token_at_offset(exc.text, exc.offset - 1)
                if token is not None:
                    evidence = _TokenEvidence(token)
            raise _LocalizedSympyError(
                parse_error,
                source,
                evidence,
                cause=exc,
            ) from None

    # Now that it's safe, get sympy expression
    try:
        res = sympy_parser.eval_expr(evaluation_code, local_dict, global_dict)
    except (TypeError, AttributeError) as exc:
        raise _LocalizedSympyError(
            BaseSympyError(),
            source,
            evaluation_failure=True,
            cause=exc,
        ) from None
    except Exception as exc:
        raise BaseSympyError from exc

    # Finally, validate the result.
    try:
        sympy_check(
            res,
            locals_for_eval,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_extra_symbols=allow_extra_symbols,
            check_evaluated_complex=not simplify_expression and not allow_complex,
        )
    except BaseSympyError as exc:
        raise _LocalizedSympyError(
            exc,
            source,
            _default_error_evidence(exc),
            cause=exc.__cause__,
        ) from None

    return res, evaluation_code


def evaluate_with_source(
    expr: str,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool = False,
    allow_sets: bool = False,
    simplify_expression: bool = True,
    allow_extra_symbols: bool = False,
) -> tuple[sympy.Expr, str | CodeType]:
    """Evaluate a SymPy expression string and return its value and source code."""
    return _evaluate_with_source(
        expr,
        locals_for_eval,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        simplify_expression=simplify_expression,
        allow_extra_symbols=allow_extra_symbols,
    )


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
    allow_extra_symbols: bool = False,
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
        allow_extra_symbols: Whether to allow symbols not listed in `variables`. Useful for
            inferring the variables of an expression from its free symbols.

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
        allow_extra_symbols=allow_extra_symbols,
    )[0]


def _convert_string_to_sympy_with_source(
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
    allow_extra_symbols: bool = False,
    resolved_name_overrides: Mapping[str, Any] | None = None,
) -> tuple[sympy.Expr, str | CodeType]:
    """Convert a string to a SymPy expression and return its generated source."""
    return _convert_source_to_sympy_with_source(
        None,
        expr,
        variables,
        allow_hidden=allow_hidden,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
        simplify_expression=simplify_expression,
        custom_functions=custom_functions,
        assumptions=assumptions,
        allow_extra_symbols=allow_extra_symbols,
        resolved_name_overrides=resolved_name_overrides,
    )


def _convert_source_to_sympy_with_source(
    source: sympy_source.SourceText | None,
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
    allow_extra_symbols: bool = False,
    resolved_name_overrides: Mapping[str, Any] | None = None,
    normalize_input: bool = False,
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
    const = sympy_constants

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
    if source is None:
        return _evaluate_with_source(
            expr,
            locals_for_eval,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            simplify_expression=simplify_expression,
            allow_extra_symbols=allow_extra_symbols,
            resolved_name_overrides=resolved_name_overrides,
        )
    if normalize_input:
        source = _normalize_source(
            expr,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
        )
    return _evaluate_normalized_source(
        source,
        locals_for_eval,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        simplify_expression=simplify_expression,
        allow_extra_symbols=allow_extra_symbols,
        resolved_name_overrides=resolved_name_overrides,
    )


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
    allow_extra_symbols: bool = False,
) -> tuple[sympy.Expr, str | CodeType]:
    """Convert a string to a SymPy expression and return its source code."""
    return _convert_string_to_sympy_with_source(
        expr,
        variables,
        allow_hidden=allow_hidden,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
        simplify_expression=simplify_expression,
        custom_functions=custom_functions,
        assumptions=assumptions,
        allow_extra_symbols=allow_extra_symbols,
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


def _token_candidates(token: str) -> list[str]:
    candidates = [token]
    candidates.extend(
        alias
        for alias, transformed_operator in sympy_constants.set_operator_desugars.items()
        if transformed_operator == token
    )
    return candidates


def _source_span(
    source: sympy_source.SourceText, start: int, end: int
) -> sympy_source.SourceSpan | None:
    tokens = source.tokens[start:end]
    if not tokens:
        return None
    return sympy_source.SourceSpan(tokens[0].raw_offset, tokens[-1].raw_offset + 1)


def _find_token_span(
    source: sympy_source.SourceText, token: str
) -> sympy_source.SourceSpan | None:
    best_match: re.Match[str] | None = None
    candidates = _token_candidates(token)
    for candidate in candidates:
        if not candidate:
            continue
        if candidate[0].isalnum() or candidate[0] == "_":
            pattern = re.compile(rf"(?<!\w){re.escape(candidate)}(?!\w)")
        else:
            pattern = re.compile(re.escape(candidate))
        for match in pattern.finditer(source.text):
            if best_match is None or match.start() >= best_match.start():
                best_match = match
    if best_match is None:
        for candidate in candidates:
            for match in re.finditer(re.escape(candidate), source.text):
                if best_match is None or match.start() >= best_match.start():
                    best_match = match
    if best_match is None:
        return None
    return _source_span(source, best_match.start(), best_match.end())


def _locate_error(error: _LocalizedSympyError) -> sympy_source.SourceSpan | None:
    if isinstance(error.evidence, _IndexEvidence):
        return _source_span(
            error.source,
            error.evidence.index,
            error.evidence.index + 1,
        )
    if isinstance(error.evidence, _TokenEvidence):
        return _find_token_span(error.source, error.evidence.token)
    return None


def _format_parse_failure(
    localized_error: _LocalizedSympyError,
    *,
    allow_complex: bool,
) -> SympyParseFailure:
    error = localized_error.error
    source = localized_error.source
    span = _locate_error(localized_error)

    def with_location(message: str) -> SympyParseFailure:
        if span is None:
            return SympyParseFailure(message)
        return SympyParseFailure(
            f"{message} <br><br><pre>{point_to_error(source.raw_text, span.start)}</pre>"
            "Note that the location of the syntax error is approximate."
        )

    if localized_error.evaluation_failure:
        return SympyParseFailure(SYMPY_EVALUATION_ERROR_WITHOUT_LOCATION)
    if isinstance(error, HasFloatError):
        return SympyParseFailure(
            f"Your answer contains the floating-point number {error.n}. "
            "All numbers must be expressed as integers (or ratios of integers)."
        )
    if isinstance(error, HasComplexError):
        message = (
            "Your answer contains a complex number. "
            "All numbers must be expressed as integers (or ratios of integers). "
        )
        if allow_complex:
            message += (
                "To include a complex number in your expression, write it as the product "
                "of an integer with the imaginary unit <code>i</code> or <code>j</code>."
            )
        return SympyParseFailure(message)
    if isinstance(error, HasSetNotationError):
        return SympyParseFailure(
            "Your answer contains set notation, but set notation is not allowed for this question."
        )
    if isinstance(error, HasInvalidExpressionError):
        return with_location("Your answer has an invalid expression.")
    if isinstance(error, HasInvalidFunctionError):
        return with_location(f'Your answer calls an invalid function "{error.text}".')
    if isinstance(error, FunctionNameWithoutArgumentsError):
        return with_location(
            f'Your answer mentions the function "{error.text}" without applying it to anything.'
        )
    if isinstance(error, HasInvalidSymbolError):
        symbol = error.symbol
        if span is not None and isinstance(localized_error.evidence, _TokenEvidence):
            symbol = source.raw_text[span.start : span.end]
        return with_location(f'Your answer refers to an invalid symbol "{symbol}".')
    if isinstance(error, HasArgumentTypeError):
        return with_location(
            f"Your answer provides the wrong types to {error.fn}. "
            f"It was expecting {error.format_allowable_types()}, but got a {error.got} "
            f"for argument #{error.arg_idx + 1} instead."
        )
    if isinstance(error, HasFunctionArityError):
        return with_location(
            f"Your answer provides the wrong number of arguments to '{error.fn}', expected {error.expected}."
        )
    if isinstance(error, HasParseError):
        if span is None:
            return SympyParseFailure(SYMPY_PARSE_ERROR_WITHOUT_LOCATION)
        return with_location("Your answer has a syntax error.")
    if isinstance(error, HasEscapeError):
        return with_location('Your answer must not contain the character "\\".')
    if isinstance(error, HasCommentError):
        return with_location('Your answer must not contain the character "#".')
    if isinstance(error, HasConflictingVariableError):
        return SympyParseFailure(
            f"Question configuration error: {error}. "
            "The variable list contains a name that conflicts with a built-in constant. "
            "Please contact the course staff."
        )
    if isinstance(error, HasConflictingFunctionError):
        return SympyParseFailure(
            f"Question configuration error: {error}. "
            "The custom function list contains a name that conflicts with a built-in function. "
            "Please contact the course staff."
        )
    if isinstance(error, HasInvalidAssumptionError):
        return SympyParseFailure(
            f"Question configuration error: {error}. Please contact the course staff."
        )
    return SympyParseFailure(
        f"Unexpected error: {error}. Please contact the course staff."
    )


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

    const = sympy_constants

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
    function_atoms = a.atoms(sympy.Function)
    functions_set = {str(func_obj.func) for func_obj in function_atoms}
    legacy_custom_function_overrides = {
        name
        for func_obj in function_atoms
        if _allows_legacy_custom_function_override(name := str(func_obj.func))
        and func_obj.func != const.set_functions[name]
    }
    custom_functions = list(
        (functions_set - reserved) | legacy_custom_function_overrides
    )

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

    variables = sympy_expr_dict["_variables"]
    # Older set-enabled submissions could contain scalar `x | y` or `x & y`.
    # Keep their variables untyped during validation so stored answers remain
    # renderable and gradable, while new text submissions use strict scalar types.
    result, _ = _convert_string_to_sympy_with_source(
        sympy_expr_dict["_value"],
        variables,
        allow_hidden=True,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
        simplify_expression=simplify_expression,
        custom_functions=sympy_expr_dict.get("_custom_functions"),
        assumptions=sympy_expr_dict.get("_assumptions"),
        resolved_name_overrides=(
            dict.fromkeys(variables) if allow_sets and variables is not None else None
        ),
    )
    return result


def try_parse_string_as_sympy(
    expr: str,
    variables: Iterable[str] | None,
    *,
    allow_complex: bool = False,
    allow_hidden: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: list[str] | None = None,
    # Retained for backwards compatibility with existing callers.
    imaginary_unit: str | None = None,  # ruff:ignore[unused-function-argument]
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
    source = sympy_source.SourceText.from_text(expr)

    return _try_parse_as_sympy(
        source,
        lambda: _convert_source_to_sympy_with_source(
            source,
            expr,
            variables,
            allow_hidden=allow_hidden,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig_functions,
            custom_functions=custom_functions,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
            normalize_input=True,
        )[0],
        allow_complex=allow_complex,
    )


def _try_parse_as_sympy(
    source: sympy_source.SourceText,
    parse: Callable[[], sympy.Expr],
    *,
    allow_complex: bool,
) -> SympyParseResult:
    try:
        expr_parsed = parse()
    except _LocalizedSympyError as exc:
        return _format_parse_failure(
            exc,
            allow_complex=allow_complex,
        )
    except BaseSympyError as exc:
        return _format_parse_failure(
            _LocalizedSympyError(
                exc,
                source,
                _default_error_evidence(exc),
                cause=exc.__cause__,
            ),
            allow_complex=allow_complex,
        )
    except Exception as exc:
        return SympyParseFailure(
            f"Unexpected error: {exc}. Please contact the course staff."
        )

    return SympyParseSuccess(expr_parsed)


@dataclass(frozen=True, slots=True)
class _SymbolicInputNormalizationError(Exception):
    message: str


@dataclass(frozen=True, slots=True)
class _SymbolicSubmissionParseSuccess:
    expr: sympy.Expr | Literal[""]
    json: SympyJson | Literal[""]


type _SymbolicInputNormalizationResult = sympy_source.SourceText | SympyParseFailure
type _SymbolicSubmissionParseResult = (
    _SymbolicSubmissionParseSuccess | SympyParseFailure
)


_PLUS_MINUS_LATEX_PATTERN = re.compile(r"\\pm(?![a-zA-Z])|\+[{}]*-")


def _restore_plus_minus_source(
    source: sympy_source.SourceText, latex: str
) -> sympy_source.SourceText | None:
    r"""Restore formula-editor ``+-`` sequences that came from ``\pm``."""
    from_plus_minus = [
        match.group(0).startswith("\\")
        for match in _PLUS_MINUS_LATEX_PATTERN.finditer(latex)
    ]
    matches = list(re.finditer(r"\+-", source.text))
    if len(matches) != len(from_plus_minus):
        return None
    if not any(from_plus_minus):
        return source

    tokens: list[sympy_source.SourceToken] = []
    last_end = 0
    for match, is_plus_minus in zip(matches, from_plus_minus, strict=True):
        tokens.extend(source.tokens[last_end : match.start()])
        if is_plus_minus:
            tokens.extend(source.tokens[match.start()].rewrite("±"))
        else:
            tokens.extend(source.tokens[match.start() : match.end()])
        last_end = match.end()
    tokens.extend(source.tokens[last_end:])
    return source.replace(tokens)


def _delete_literal(
    source: sympy_source.SourceText, literal: str
) -> sympy_source.SourceText:
    tokens: list[sympy_source.SourceToken] = []
    last_end = 0
    for match in re.finditer(re.escape(literal), source.text):
        tokens.extend(source.tokens[last_end : match.start()])
        last_end = match.end()
    tokens.extend(source.tokens[last_end:])
    return source.replace(tokens)


def _replace_editor_operators(
    source: sympy_source.SourceText,
) -> sympy_source.SourceText:
    text = source.text
    tokens: list[sympy_source.SourceToken] = []
    index = 0
    while index < len(text):
        if text.startswith("-:", index):
            tokens.extend(source.tokens[index].rewrite("/"))
            index += 2
            continue
        if text.startswith(" ** ", index):
            left_star = source.tokens[index + 1]
            right_star = source.tokens[index + 2]
            if (
                source.raw_text[left_star.raw_offset] == "*"
                and source.raw_text[right_star.raw_offset] == "*"
            ):
                tokens.extend((
                    source.tokens[index],
                    left_star,
                    source.tokens[index + 3],
                ))
                index += 4
                continue
        tokens.append(source.tokens[index])
        index += 1
    return source.replace(tokens)


def _build_formula_editor_tokens(
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    allow_trig_functions: bool,
    allow_sets: bool,
) -> list[str]:
    tokens = (
        list(sympy_constants.standard_operators)
        + list(
            get_builtin_functions(
                allow_trig_functions=allow_trig_functions,
                allow_sets=allow_sets,
            )
        )
        + list(custom_functions)
        + list(variables)
    )
    tokens += [
        greek_unicode_transform(token)
        for token in tokens
        if greek_unicode_transform(token) != token
    ]
    return [token for token in tokens if len(token) > 1 and token != "**"]


def _merge_spaced_source(
    source: sympy_source.SourceText, tokens: Sequence[str]
) -> sympy_source.SourceText:
    spaced = [(token, " ".join(token)) for token in tokens]
    spaced.sort(key=lambda item: -len(item[1]))

    merged_tokens: list[sympy_source.SourceToken] = []
    text = source.text
    index = 0
    while index < len(text):
        for token, spaced_token in spaced:
            if text.startswith(spaced_token, index):
                for char_index, char in enumerate(token):
                    merged_tokens.extend(
                        source.tokens[index + char_index * 2].rewrite(char)
                    )
                index += len(spaced_token)
                break
        else:
            merged_tokens.append(source.tokens[index])
            index += 1
    return source.replace(merged_tokens)


def _add_multiplication_spaces_source(
    source: sympy_source.SourceText, protected_tokens: Sequence[str]
) -> sympy_source.SourceText:
    text = source.text
    protected_positions: set[int] = set()
    for token in protected_tokens:
        if not re.search(r"\d", token):
            continue
        for match in re.finditer(re.escape(token), text):
            protected_positions.update(range(match.start(), match.end()))

    tokens: list[sympy_source.SourceToken] = []
    for index, token in enumerate(source.tokens):
        tokens.append(token)
        if index + 1 >= len(source.tokens):
            continue
        if (
            token.text.isalpha()
            and source.tokens[index + 1].text.isdigit()
            and index + 1 not in protected_positions
        ):
            tokens.extend(source.tokens[index + 1].rewrite(" "))
    return source.replace(tokens)


_TRAILING_IDENTIFIER_PATTERN = re.compile(r"[A-Za-z_]\w*$")


def _is_implicit_multiplication_paren(
    text: str,
    argument_start: int,
    argument_end: int,
    function_names: frozenset[str],
) -> bool:
    """
    Whether a "(" after an argument multiplies it rather than calling a function
    or grouping an exponent.

    Returns:
        True if the argument ends with a number, a closing bracket, or a name
        that isn't a function.
    """
    # An empty candidate provides no left-hand factor for implicit multiplication.
    if argument_end == argument_start:
        return False

    # Isolate the final identifier before checking its last character. This keeps
    # digit-suffixed function names such as atan2 from looking like numbers.
    name_start = argument_end
    while name_start > argument_start and (
        text[name_start - 1].isalnum() or text[name_start - 1] == "_"
    ):
        name_start -= 1
    name = _TRAILING_IDENTIFIER_PATTERN.search(text, name_start, argument_end)

    # Known functions consume the "(" as a call; all other names multiply the
    # parenthesized factor.
    if name is not None:
        return name.group(0) not in function_names

    # Known digit-suffixed functions were handled above, so a remaining digit
    # ends a numeric argument before the next implicitly multiplied factor.
    if text[argument_end - 1].isdigit():
        return True

    # A closing delimiter completes a grouped argument, making the following
    # "(" the start of a new implicitly multiplied factor.
    return text[argument_end - 1] in ")]}"


@lru_cache(maxsize=128)
def _bare_function_token_pattern(function_names: frozenset[str]) -> re.Pattern[str]:
    names = sorted(function_names, key=len, reverse=True)
    return re.compile(
        r"(?P<function>(?<![A-Za-z_])(?:"
        + "|".join(map(re.escape, names))
        + r")\s+(?=[^\s(]))|(?P<token>\*+|[()\[\]{}+\-/,])"
    )


def _wrap_bare_function_arguments_source(
    source: sympy_source.SourceText, function_names: frozenset[str]
) -> sympy_source.SourceText:
    if not function_names:
        return source
    text = source.text
    pattern = _bare_function_token_pattern(function_names)
    # Each "(" sorts before a ")" at the same index, which only happens for an
    # empty argument.
    insertions: list[tuple[int, sympy_source.SourceToken]] = []
    # Only the first bare function at a given nesting depth can claim the next
    # implicit multiplication boundary; any later one is inside its argument.
    pending_arguments: dict[int, int] = {}
    depth = 0
    for match in pattern.finditer(text):
        if match.lastgroup == "function":
            pending_arguments.setdefault(depth, match.end())
            continue

        token = match.group(0)
        match token:
            case "(" | "*":
                start = pending_arguments.get(depth)
                if start is not None:
                    argument_start = start
                    while (
                        argument_start < match.start()
                        and text[argument_start].isspace()
                    ):
                        argument_start += 1
                    argument_end = match.start()
                    while (
                        argument_end > argument_start
                        and text[argument_end - 1].isspace()
                    ):
                        argument_end -= 1
                    if token == "*" or _is_implicit_multiplication_paren(
                        text, argument_start, argument_end, function_names
                    ):
                        pending_arguments.pop(depth)
                        open_token = source.tokens[
                            min(argument_start, len(source.tokens) - 1)
                        ].rewrite("(")[0]
                        close_token = source.tokens[max(argument_end - 1, 0)].rewrite(
                            ")"
                        )[0]
                        insertions.extend((
                            (start, open_token),
                            (argument_end, close_token),
                        ))
                if token == "(":
                    depth += 1
            case "[" | "{":
                depth += 1
            case ")" | "]" | "}":
                pending_arguments.pop(depth, None)
                depth -= 1
            case "+" | "-" | "/" | ",":
                pending_arguments.pop(depth, None)
            case _:
                pass

    tokens: list[sympy_source.SourceToken] = []
    position = 0
    for index, parenthesis in sorted(
        insertions, key=lambda insertion: (insertion[0], insertion[1].text)
    ):
        tokens.extend(source.tokens[position:index])
        tokens.append(parenthesis)
        position = index
    tokens.extend(source.tokens[position:])
    return source.replace(tokens)


def _format_formula_editor_source(
    source: sympy_source.SourceText,
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    allow_trig_functions: bool,
    allow_sets: bool,
) -> sympy_source.SourceText:
    source = _delete_literal(_delete_literal(source, "{:"), ":}")
    source = _replace_editor_operators(source)
    known_tokens = _build_formula_editor_tokens(
        variables,
        custom_functions,
        allow_trig_functions=allow_trig_functions,
        allow_sets=allow_sets,
    )
    source = _merge_spaced_source(source, known_tokens)
    source = _add_multiplication_spaces_source(source, known_tokens)
    function_names = frozenset(
        greek_unicode_transform(name)
        for name in (
            get_builtin_callable_functions(
                allow_trig_functions=allow_trig_functions,
                allow_sets=allow_sets,
            )
            | set(custom_functions)
        )
    )
    return _wrap_bare_function_arguments_source(source, function_names)


_ABSOLUTE_VALUE_PATTERN = re.compile(
    r"(\|\s*[a-zA-Z0-9(+\-]([^|]*[a-zA-Z0-9!)])\s*\|)|(\|\s*[a-zA-Z0-9]\s*\|)"
)


def _convert_absolute_values_source(
    source: sympy_source.SourceText, *, allow_sets: bool
) -> sympy_source.SourceText:
    original_text = source.text
    text = original_text
    tokens = list(source.tokens)
    bar_pattern = re.compile(r"\|")
    search_from = 0
    preceding_bars: list[int] = []
    while match := _ABSOLUTE_VALUE_PATTERN.search(text, search_from):
        preceding_bars.extend(
            bar_match.start()
            for bar_match in bar_pattern.finditer(text, search_from, match.start())
        )
        content = text[match.start() + 1 : match.end() - 1]
        if allow_sets and "," in content:
            preceding_bars.append(match.start())
            search_from = match.start() + 1
            continue

        replacement_tokens = (
            tokens[match.start()].rewrite("abs(")
            + tuple(tokens[match.start() + 1 : match.end() - 1])
            + tokens[match.end() - 1].rewrite(")")
        )
        text = text[: match.start()] + f"abs({content})" + text[match.end() :]
        tokens[match.start() : match.end()] = replacement_tokens
        search_from = preceding_bars.pop() if preceding_bars else match.start()

    if not allow_sets and "|" in text:
        raise _SymbolicInputNormalizationError(
            f"The absolute value bars in your answer are mismatched or ambiguous: <code>{original_text}</code>."
        )
    return source.replace(tokens)


def _normalize_symbolic_input(
    text: str,
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    formula_editor: bool,
    latex: str | None,
    allow_trig_functions: bool,
    allow_complex: bool,
    allow_sets: bool,
) -> sympy_source.SourceText:
    """Normalize a symbolic-input submission in its required transformation order."""
    source = _normalize_unicode_source(
        sympy_source.SourceText.from_text(text), formula_editor=formula_editor
    )
    if formula_editor:
        if latex is not None:
            restored = _restore_plus_minus_source(source, latex)
            if restored is None:
                raise _SymbolicInputNormalizationError(
                    SYMPY_PARSE_ERROR_WITHOUT_LOCATION
                )
            source = restored
        source = _format_formula_editor_source(
            source,
            variables,
            custom_functions,
            allow_trig_functions=allow_trig_functions,
            allow_sets=allow_sets,
        )
    source = _convert_absolute_values_source(source, allow_sets=allow_sets)
    return _validate_and_rewrite_source(
        source,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )


def _try_normalize_symbolic_input(
    text: str,
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    formula_editor: bool,
    latex: str | None,
    allow_trig_functions: bool,
    allow_complex: bool,
    allow_sets: bool,
) -> _SymbolicInputNormalizationResult:
    """Normalize a submission, returning existing user-facing parse failures."""
    try:
        return _normalize_symbolic_input(
            text,
            variables,
            custom_functions,
            formula_editor=formula_editor,
            latex=latex,
            allow_trig_functions=allow_trig_functions,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
        )
    except _SymbolicInputNormalizationError as exc:
        return SympyParseFailure(exc.message)
    except BaseSympyError as exc:

        def raise_normalization_error(
            error: BaseSympyError = exc,
        ) -> sympy.Expr:
            raise error

        result = _try_parse_as_sympy(
            sympy_source.SourceText.from_text(text),
            raise_normalization_error,
            allow_complex=allow_complex,
        )
        assert isinstance(result, SympyParseFailure)
        return result


def _try_parse_normalized_source_as_sympy(
    source: sympy_source.SourceText,
    variables: Iterable[str] | None,
    *,
    allow_complex: bool = False,
    allow_hidden: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: list[str] | None = None,
    simplify_expression: bool = True,
    assumptions: AssumptionsDictT | None = None,
) -> SympyParseResult:
    """Parse text that has already passed through symbolic-input normalization."""
    return _try_parse_as_sympy(
        source,
        lambda: _convert_source_to_sympy_with_source(
            source,
            source.raw_text,
            variables,
            allow_hidden=allow_hidden,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig_functions,
            custom_functions=custom_functions,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
        )[0],
        allow_complex=allow_complex,
    )


def try_parse_symbolic_submission(
    submission: str | None,
    variables: Iterable[str] | None,
    *,
    formula_editor: bool = False,
    formula_editor_latex: str | None = None,
    allow_blank: bool = False,
    blank_value: str = "0",
    allow_complex: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: Sequence[str] = (),
    imaginary_unit: str | None = None,
    simplify_expression: bool = True,
    assumptions: AssumptionsDictT | None = None,
) -> _SymbolicSubmissionParseResult:
    """Normalize, parse, and serialize a symbolic element submission."""
    if submission is None:
        return SympyParseFailure("No submitted answer.")

    variable_list = list(variables or ())
    custom_function_list = list(custom_functions)
    normalized = _try_normalize_symbolic_input(
        submission,
        variable_list,
        custom_function_list,
        formula_editor=formula_editor,
        latex=formula_editor_latex,
        allow_trig_functions=allow_trig_functions,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )
    if isinstance(normalized, SympyParseFailure):
        return normalized

    if not normalized.text.strip():
        if not allow_blank:
            return SympyParseFailure("No submitted answer.")
        if not blank_value.strip():
            return _SymbolicSubmissionParseSuccess("", "")
        result = try_parse_string_as_sympy(
            blank_value,
            variable_list,
            allow_hidden=True,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig_functions,
            imaginary_unit=imaginary_unit,
            custom_functions=custom_function_list,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
        )
    else:
        result = _try_parse_normalized_source_as_sympy(
            normalized,
            variable_list,
            allow_hidden=True,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig_functions,
            custom_functions=custom_function_list,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
        )
    if isinstance(result, SympyParseFailure):
        return result

    try:
        submission_json = sympy_to_json(
            result.expr,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
        )
        json_to_sympy(
            submission_json,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            simplify_expression=simplify_expression,
        )
    except Exception:
        return SympyParseFailure(
            "Your answer was simplified to this, which contains an invalid expression: "
            f"$${sympy.latex(result.expr)}$$"
        )
    return _SymbolicSubmissionParseSuccess(result.expr, submission_json)


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
    set_fn_names = sympy_constants.set_functions.keys() | set_notation_only_tokens

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
    set_ops = sympy_constants.set_operator_desugars
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
    const = sympy_constants
    names = set(const.variables.keys())
    if allow_complex:
        names |= const.complex_variables.keys()
    if allow_hidden:
        names.update(const.hidden_variables.keys())
    if allow_complex and allow_hidden:
        names.update(const.hidden_complex_variables.keys())
    return names


def get_builtin_callable_functions(
    *,
    allow_trig_functions: bool = True,
    allow_sets: bool = False,
    include_helpers: bool = True,
) -> set[str]:
    """Return the set of built-in callable function names.

    Parameters:
        allow_trig_functions: Whether to include trigonometric functions.
        allow_sets: Whether to include set constructors.
        include_helpers: Whether to include internal parsing helpers.

    Returns:
        A set of built-in callable function names.
    """
    const = sympy_constants
    names = set(const.functions)
    if include_helpers:
        names.update(const.helpers)
    if allow_trig_functions:
        names.update(const.trig_functions)
    if allow_sets:
        names.update(const.set_functions)
    return names


def get_builtin_functions(
    *, allow_trig_functions: bool = True, allow_sets: bool = False
) -> set[str]:
    """Return the set of built-in function and operator names.

    Parameters:
        allow_trig_functions: Whether to include trigonometric functions.
        allow_sets: Whether to include set operators and constructors.

    Returns:
        A set of built-in function and operator names.
    """
    const = sympy_constants
    names = get_builtin_callable_functions(
        allow_trig_functions=allow_trig_functions,
        allow_sets=allow_sets,
    )
    if allow_sets:
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
    set_ops = tuple(sympy_constants.set_operators.keys())

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
        if sanitized in valid_names or (
            _conflicts(sanitized)
            and not _allows_legacy_custom_function_override(sanitized)
        ):
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


def greek_unicode_transform(input_str: str) -> str:
    """Return input_str where all unicode greek letters are replaced by their spelled-out english names."""
    return input_str.translate(sympy_constants.greek_alphabet)
