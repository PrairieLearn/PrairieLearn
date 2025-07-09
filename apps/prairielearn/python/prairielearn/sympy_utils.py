"""Utility functions for parsing and evaluating SymPy expressions.

```python
from prairielearn.sympy_utils import ...
```
"""

import ast
import copy
import html
from collections import deque
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from tokenize import TokenError
from typing import Any, Literal, TypedDict, TypeGuard, cast

import sympy
from sympy.parsing.sympy_parser import (
    eval_expr,
    implicit_multiplication_application,
    standard_transformations,
    stringify_expr,
)
from typing_extensions import NotRequired

from prairielearn.misc_utils import full_unidecode

STANDARD_OPERATORS = ("( )", "+", "-", "*", "/", "^", "**", "!")

SympyMapT = dict[str, sympy.Basic | complex]
SympyFunctionMapT = dict[str, Callable[..., Any]]
ASTWhiteListT = tuple[type[ast.AST], ...]
AssumptionsDictT = dict[str, dict[str, Any]]
"""
A dictionary of assumptions for variables in the expression.

Examples:
    >>> {"x": {"positive": True}, "y": {"real": True}}
"""


class SympyJson(TypedDict):
    """A class with type signatures for the SymPy JSON dict"""

    _type: Literal["sympy"]
    _value: str
    _variables: list[str]
    _assumptions: NotRequired[AssumptionsDictT]
    _custom_functions: NotRequired[list[str]]


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


# Create a new instance of this class to access the member dictionaries. This
# is to avoid accidentally modifying these dictionaries.
class _Constants:
    helpers: SympyFunctionMapT
    variables: SympyMapT
    hidden_variables: SympyMapT
    complex_variables: SympyMapT
    hidden_complex_variables: SympyMapT
    functions: SympyFunctionMapT
    trig_functions: SympyFunctionMapT

    def __init__(self) -> None:
        self.helpers = {
            "_Integer": sympy.Integer,
        }

        self.variables = {"pi": sympy.pi, "e": sympy.E, "infty": sympy.oo}

        self.hidden_variables = {
            "_Exp1": sympy.E,
        }

        self.complex_variables = {
            "i": sympy.I,
            "j": sympy.I,
        }

        self.hidden_complex_variables = {
            "_ImaginaryUnit": sympy.I,
        }

        self.functions = {
            "exp": sympy.exp,
            "log": sympy.log,
            "ln": sympy.log,
            "sqrt": sympy.sqrt,
            "factorial": sympy.factorial,
            "abs": sympy.Abs,
            "sgn": sympy.sign,
            "max": sympy.Max,
            "min": sympy.Min,
            # Extra aliases to make parsing work correctly
            "sign": sympy.sign,
            "Abs": sympy.Abs,
            "Max": sympy.Max,
            "Min": sympy.Min,
        }

        self.trig_functions = {
            "cos": sympy.cos,
            "sin": sympy.sin,
            "tan": sympy.tan,
            "sec": sympy.sec,
            "cot": sympy.cot,
            "csc": sympy.csc,
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
        }


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
class HasInvalidExpressionError(BaseSympyError):
    offset: int


@dataclass
class HasInvalidFunctionError(BaseSympyError):
    offset: int
    text: str


@dataclass
class HasInvalidVariableError(BaseSympyError):
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


class CheckAST(ast.NodeVisitor):
    whitelist: ASTWhiteListT
    variables: SympyMapT
    functions: SympyFunctionMapT
    __parents: dict[int, ast.AST]

    def __init__(
        self,
        whitelist: ASTWhiteListT,
        variables: SympyMapT,
        functions: SympyFunctionMapT,
    ) -> None:
        self.whitelist = whitelist
        self.variables = variables
        self.functions = functions
        self.__parents = {}

    def visit(self, node: ast.AST) -> None:
        if not isinstance(node, self.whitelist):
            err_node = self.get_parent_with_location(node)
            raise HasInvalidExpressionError(err_node.col_offset)
        return super().visit(node)

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        if isinstance(node.func, ast.Name) and node.func.id not in self.functions:
            err_node = self.get_parent_with_location(node)
            raise HasInvalidFunctionError(err_node.col_offset, err_node.func.id)
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:  # noqa: N802
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
            raise HasInvalidVariableError(err_node.col_offset, err_node.id)
        self.generic_visit(node)

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

        self.visit(root)

        # Empty parents dict after execution
        # dict is only populated during execution
        self.__parents = {}


def ast_check_str(expr: str, locals_for_eval: LocalsForEval) -> None:
    """Check the AST of the expression for security, whitelisting only certain nodes.

    This prevents the user from executing arbitrary code through `eval_expr`.

    Raises:
        HasEscapeError: If the expression contains an escape character.
        HasCommentError: If the expression contains a comment character.
    """
    # Disallow escape character
    ind = expr.find("\\")
    if ind != -1:
        raise HasEscapeError(ind)

    # Disallow comment character
    ind = expr.find("#")
    if ind != -1:
        raise HasCommentError(ind)

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
    )

    CheckAST(
        whitelist, locals_for_eval["variables"], locals_for_eval["functions"]
    ).check_expression(expr)


def sympy_check(
    expr: sympy.Expr, locals_for_eval: LocalsForEval, *, allow_complex: bool
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
        if not allow_complex and item == sympy.I:
            raise HasComplexError("complex values not allowed")

        work_stack.extend(item.args)


def evaluate(
    expr: str, locals_for_eval: LocalsForEval, *, allow_complex: bool = False
) -> sympy.Expr:
    """Evaluate a SymPy expression string with a given set of locals, and return only the result.

    Returns:
        A SymPy expression.
    """
    return evaluate_with_source(expr, locals_for_eval, allow_complex=allow_complex)[0]


def evaluate_with_source(
    expr: str, locals_for_eval: LocalsForEval, *, allow_complex: bool = False
) -> tuple[sympy.Expr, str]:
    """Evaluate a SymPy expression string with a given set of locals.

    Returns:
        A tuple of the SymPy expression and the code that was used to generate it.

    Raises:
        HasParseError: If the expression cannot be parsed.
        BaseSympyError: If the expression cannot be evaluated.
    """
    # Replace '^' with '**' wherever it appears. In MATLAB, either can be used
    # for exponentiation. In Python, only the latter can be used.
    expr = full_unidecode(greek_unicode_transform(expr)).replace("^", "**")

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

    transformations = (*standard_transformations, implicit_multiplication_application)

    try:
        code = stringify_expr(expr, local_dict, global_dict, transformations)
    except TokenError as exc:
        raise HasParseError(-1) from exc

    # First do AST check, mainly for security
    parsed_locals_to_eval = copy.deepcopy(locals_for_eval)

    # Add locals that appear after sympy stringification
    # This check is only for safety, so won't change what gets parsed
    parsed_locals_to_eval["functions"].update(
        Integer=sympy.Integer,
        Symbol=sympy.Symbol,
        Float=sympy.Float,
    )

    parsed_locals_to_eval["variables"].update(
        I=sympy.I,
        oo=sympy.oo,
    )

    ast_check_str(code, parsed_locals_to_eval)

    # Now that it's safe, get sympy expression
    try:
        res = eval_expr(code, local_dict, global_dict)
    except Exception as exc:
        raise BaseSympyError from exc

    # Finally, check for invalid symbols
    sympy_check(res, locals_for_eval, allow_complex=allow_complex)

    return res, code


def convert_string_to_sympy(
    expr: str,
    variables: Iterable[str] | None = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
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
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig_functions,
        custom_functions=custom_functions,
        assumptions=assumptions,
    )[0]


def convert_string_to_sympy_with_source(
    expr: str,
    variables: Iterable[str] | None = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: Iterable[str] | None = None,
    assumptions: AssumptionsDictT | None = None,
) -> tuple[sympy.Expr, str]:
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
    const = _Constants()

    # Create a whitelist of valid functions and variables (and a special flag
    # for numbers that are converted to sympy integers).
    locals_for_eval: LocalsForEval = {
        "functions": const.functions,
        "variables": const.variables,
        "helpers": const.helpers,
    }

    if allow_hidden:
        locals_for_eval["variables"].update(const.hidden_variables)
    if allow_complex:
        locals_for_eval["variables"].update(const.complex_variables)
        if allow_hidden:
            locals_for_eval["variables"].update(const.hidden_complex_variables)

    if allow_trig_functions:
        locals_for_eval["functions"].update(const.trig_functions)

    used_names = set().union(
        *(cast(SympyMapT, inner_dict).keys() for inner_dict in locals_for_eval.values())
    )

    # Check assumptions are all made about valid variables only
    if assumptions is not None:
        unbound_variables = assumptions.keys() - set(
            variables if variables is not None else []
        )
        if unbound_variables:
            raise HasInvalidAssumptionError(
                f"Assumptions for variables that are not present: {','.join(unbound_variables)}"
            )

    # If there is a list of variables, add each one to the whitelist with assumptions
    if variables is not None:
        variable_dict = locals_for_eval["variables"]

        for raw_variable in variables:
            variable = greek_unicode_transform(raw_variable)
            # Check for naming conflicts
            if variable in used_names:
                raise HasConflictingVariableError(
                    f"Conflicting variable name: {variable}"
                )
            used_names.add(variable)

            # If no conflict, add to locals dict with assumptions
            if assumptions is None:
                variable_dict[variable] = sympy.Symbol(variable)
            else:
                variable_dict[variable] = sympy.Symbol(
                    variable, **assumptions.get(variable, {})
                )

    # If there is a list of custom functions, add each one to the whitelist
    if custom_functions is not None:
        function_dict = locals_for_eval["functions"]
        for raw_function in custom_functions:
            function = greek_unicode_transform(raw_function)
            if function in used_names:
                raise HasConflictingFunctionError(
                    f"Conflicting variable name: {function}"
                )

            used_names.add(function)

            function_dict[function] = sympy.Function(function)

    # Do the conversion
    return evaluate_with_source(expr, locals_for_eval, allow_complex=allow_complex)


def point_to_error(expr: str, ind: int, w: int = 5) -> str:
    """Generate a string with a pointer to error in expr with index ind

    Returns:
        A string with the error location in the expression.
    """
    w_left: str = " " * (ind - max(0, ind - w))
    w_right: str = " " * (min(ind + w, len(expr)) - ind)
    initial: str = html.escape(expr[ind - len(w_left) : ind + len(w_right)])
    return f"{initial}\n{w_left}^{w_right}"


def sympy_to_json(
    a: sympy.Expr, *, allow_complex: bool = True, allow_trig_functions: bool = True
) -> SympyJson:
    """Convert a SymPy expression to a JSON-seralizable dictionary.

    Returns:
        A JSON-serializable representation of the SymPy expression.
    """
    const = _Constants()

    # Get list of variables in the sympy expression
    variables = list(map(str, a.free_symbols))

    # Get reserved variables for custom function parsing
    reserved = (
        const.helpers.keys()
        | const.variables.keys()
        | const.hidden_variables.keys()
        | const.functions.keys()
    )
    if allow_complex:
        reserved |= (
            const.complex_variables.keys() | const.hidden_complex_variables.keys()
        )
    if allow_trig_functions:
        reserved |= const.trig_functions.keys()

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
        "_value": str(a_sub),
        "_variables": variables,
        "_assumptions": assumptions_dict,
        "_custom_functions": custom_functions,
    }


def json_to_sympy(
    sympy_expr_dict: SympyJson,
    *,
    allow_complex: bool = True,
    allow_trig_functions: bool = True,
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
        allow_trig_functions=allow_trig_functions,
        custom_functions=sympy_expr_dict.get("_custom_functions"),
        assumptions=sympy_expr_dict.get("_assumptions"),
    )


def validate_string_as_sympy(
    expr: str,
    variables: Iterable[str] | None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: list[str] | None = None,
    imaginary_unit: str | None = None,
) -> str | None:
    """Try to parse expr as a SymPy expression. If it fails, return a string with an appropriate error message for display on the frontend.

    Returns:
        `None` if the expression is valid, and an error message otherwise.
    """
    try:
        expr_parsed = convert_string_to_sympy(
            expr,
            variables,
            allow_hidden=allow_hidden,
            allow_complex=allow_complex,
            allow_trig_functions=allow_trig_functions,
            custom_functions=custom_functions,
        )
    except HasFloatError as exc:
        return (
            f"Your answer contains the floating-point number {exc.n}. "
            f"All numbers must be expressed as integers (or ratios of integers)."
        )
    except HasComplexError:
        err_string = [
            "Your answer contains a complex number. "
            "All numbers must be expressed as integers (or ratios of integers). "
        ]

        if allow_complex:
            err_string.append(
                "To include a complex number in your expression, write it as the product "
                "of an integer with the imaginary unit <code>i</code> or <code>j</code>."
            )

        return "".join(err_string)
    except HasInvalidExpressionError as exc:
        return (
            f"Your answer has an invalid expression. "
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasInvalidFunctionError as exc:
        return (
            f'Your answer calls an invalid function "{exc.text}". '
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasInvalidVariableError as exc:
        return (
            f'Your answer refers to an invalid variable "{exc.text}". '
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except FunctionNameWithoutArgumentsError as exc:
        return (
            f'Your answer mentions the function "{exc.text}" without '
            "applying it to anything. "
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasInvalidSymbolError as exc:
        return (
            f'Your answer refers to an invalid symbol "{exc.symbol}". '
            f"<br><br><pre>{point_to_error(expr, -1)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasParseError as exc:
        return (
            f"Your answer has a syntax error. "
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasEscapeError as exc:
        return (
            f'Your answer must not contain the character "\\". '
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasCommentError as exc:
        return (
            f'Your answer must not contain the character "#". '
            f"<br><br><pre>{point_to_error(expr, exc.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except Exception:
        return "Invalid format."

    # If complex numbers are not allowed, raise error if expression has the imaginary unit
    if (
        (not allow_complex)
        and (imaginary_unit is not None)
        and (expr_parsed.has(sympy.I))
    ):
        expr_parsed = expr_parsed.subs(sympy.I, sympy.Symbol(imaginary_unit))
        return (
            "Your answer was simplified to this, which contains a complex number"
            f"(denoted ${imaginary_unit}$): $${sympy.latex(expr_parsed)}$$"
        )

    return None


def get_items_list(items_string: str | None) -> list[str]:
    """Return a list of items from a comma-separated string."""
    if items_string is None:
        return []

    return list(map(str.strip, items_string.split(",")))


def greek_unicode_transform(input_str: str) -> str:
    """Return input_str where all unicode greek letters are replaced by their spelled-out english names."""
    # From https://gist.github.com/beniwohli/765262
    greek_alphabet = {
        "\u0391": "Alpha",
        "\u0392": "Beta",
        "\u0393": "Gamma",
        "\u0394": "Delta",
        "\u0395": "Epsilon",
        "\u0396": "Zeta",
        "\u0397": "Eta",
        "\u0398": "Theta",
        "\u0399": "Iota",
        "\u039a": "Kappa",
        "\u039b": "Lamda",
        "\u039c": "Mu",
        "\u039d": "Nu",
        "\u039e": "Xi",
        "\u039f": "Omicron",
        "\u03a0": "Pi",
        "\u03a1": "Rho",
        "\u03a3": "Sigma",
        "\u03a4": "Tau",
        "\u03a5": "Upsilon",
        "\u03a6": "Phi",
        "\u03a7": "Chi",
        "\u03a8": "Psi",
        "\u03a9": "Omega",
        "\u03b1": "alpha",
        "\u03b2": "beta",
        "\u03b3": "gamma",
        "\u03b4": "delta",
        "\u03b5": "epsilon",
        "\u03b6": "zeta",
        "\u03b7": "eta",
        "\u03b8": "theta",
        "\u03b9": "iota",
        "\u03ba": "kappa",
        "\u03bb": "lamda",
        "\u03bc": "mu",
        "\u03bd": "nu",
        "\u03be": "xi",
        "\u03bf": "omicron",
        "\u03c0": "pi",
        "\u03c1": "rho",
        "\u03c3": "sigma",
        "\u03c4": "tau",
        "\u03c5": "upsilon",
        "\u03c6": "phi",
        "\u03c7": "chi",
        "\u03c8": "psi",
        "\u03c9": "omega",
    }

    return "".join(greek_alphabet.get(c, c) for c in input_str)
