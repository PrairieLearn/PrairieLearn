import ast
import copy
import html
from collections import deque
from dataclasses import dataclass
from tokenize import TokenError
from typing import Any, Callable, Literal, Type, TypedDict, cast

import prairielearn as pl
import sympy
from sympy.parsing.sympy_parser import (
    eval_expr,
    implicit_multiplication_application,
    standard_transformations,
    stringify_expr,
)
from typing_extensions import NotRequired

STANDARD_OPERATORS = ("( )", "+", "-", "*", "/", "^", "**", "!")

SympyMapT = dict[str, Callable | sympy.Basic]
ASTWhiteListT = tuple[Type[ast.AST], ...]
AssumptionsDictT = dict[str, dict[str, Any]]


class SympyJson(TypedDict):
    """A class with type signatures for the sympy json dict"""

    _type: Literal["sympy"]
    _value: str
    _variables: list[str]
    _assumptions: NotRequired[AssumptionsDictT]
    _custom_functions: NotRequired[list[str]]


class LocalsForEval(TypedDict):
    """A class with type signatures for the locals_for_eval dict"""

    functions: SympyMapT
    variables: SympyMapT
    helpers: SympyMapT


# Create a new instance of this class to access the member dictionaries. This
# is to avoid accidentally modifying these dictionaries.
class _Constants:
    helpers: SympyMapT
    variables: SympyMapT
    hidden_variables: SympyMapT
    complex_variables: SympyMapT
    hidden_complex_variables: SympyMapT
    functions: SympyMapT
    trig_functions: SympyMapT

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
    """Exception base class for sympy parsing errors"""

    pass


class HasConflictingVariable(BaseSympyError):
    pass


class HasConflictingFunction(BaseSympyError):
    pass


class HasInvalidAssumption(BaseSympyError):
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
class FunctionNameUsedWithoutArguments(BaseSympyError):
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


class CheckWhiteList(ast.NodeVisitor):
    def __init__(self, whitelist: ASTWhiteListT) -> None:
        self.whitelist = whitelist

    def visit(self, node: ast.AST) -> None:
        if not isinstance(node, self.whitelist):
            err_node = get_parent_with_location(node)
            raise HasInvalidExpressionError(err_node.col_offset)
        return super().visit(node)


class CheckFunctions(ast.NodeVisitor):
    def __init__(self, functions: SympyMapT) -> None:
        self.functions = functions

    def visit_Call(self, node: ast.Call) -> None:
        if isinstance(node.func, ast.Name) and node.func.id not in self.functions:
            err_node = get_parent_with_location(node)
            raise HasInvalidFunctionError(err_node.col_offset, err_node.func.id)
        self.generic_visit(node)


class CheckVariables(ast.NodeVisitor):
    def __init__(self, variables: SympyMapT, functions: SympyMapT) -> None:
        # functions is only used for error type, if someone writes "exp + 2"
        self.variables = variables
        self.functions = functions

    def visit_Name(self, node: ast.Name) -> None:
        if (
            isinstance(node.ctx, ast.Load)
            and not is_name_of_function(node)
            and node.id not in self.variables
        ):
            err_node = get_parent_with_location(node)
            if node.id in self.functions:
                raise FunctionNameUsedWithoutArguments(err_node.col_offset, err_node.id)
            else:
                raise HasInvalidVariableError(err_node.col_offset, err_node.id)
        self.generic_visit(node)


def is_name_of_function(node: ast.AST) -> bool:
    # The node is the name of a function if all of the following are true:
    # 1) it has type ast.Name
    # 2) its parent has type ast.Call
    # 3) it is not in the list of parent's args
    return isinstance(node, ast.Name) and isinstance(node.parent, ast.Call) and (node not in node.parent.args)  # type: ignore


def get_parent_with_location(node: ast.AST) -> Any:
    if hasattr(node, "col_offset"):
        return node

    return get_parent_with_location(node.parent)  # type: ignore


def ast_check(expr: str, locals_for_eval: LocalsForEval) -> None:
    # Disallow escape character
    ind = expr.find("\\")
    if ind != -1:
        raise HasEscapeError(ind)

    # Disallow comment character
    ind = expr.find("#")
    if ind != -1:
        raise HasCommentError(ind)

    # Parse (convert string to AST)
    try:
        root = ast.parse(expr, mode="eval")
    except SyntaxError as err:
        offset = err.offset if err.offset is not None else -1
        raise HasParseError(offset)

    # Link each node to its parent
    for node in ast.walk(root):
        for child in ast.iter_child_nodes(node):
            child.parent = node  # type: ignore

    # Disallow functions that are not in locals_for_eval
    CheckFunctions(locals_for_eval["functions"]).visit(root)

    # Disallow variables that are not in locals_for_eval
    CheckVariables(locals_for_eval["variables"], locals_for_eval["functions"]).visit(
        root
    )

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

    CheckWhiteList(whitelist).visit(root)


def sympy_check(
    expr: sympy.Expr, locals_for_eval: LocalsForEval, allow_complex: bool
) -> None:
    valid_symbols = set().union(
        *(cast(SympyMapT, inner_dict).keys() for inner_dict in locals_for_eval.values())
    )

    work_stack: deque[sympy.Basic] = deque([expr])

    while work_stack:
        item = work_stack.pop()
        str_item = str(item)

        if isinstance(item, sympy.Symbol) and str_item not in valid_symbols:
            raise HasInvalidSymbolError(str_item)
        elif isinstance(item, sympy.Float):
            raise HasFloatError(float(str_item))
        elif not allow_complex and item == sympy.I:
            raise HasComplexError()

        work_stack.extend(item.args)


def evaluate(
    expr: str, locals_for_eval: LocalsForEval, *, allow_complex=False
) -> sympy.Expr:
    return evaluate_with_source(expr, locals_for_eval, allow_complex=allow_complex)[0]


def evaluate_with_source(
    expr: str, locals_for_eval: LocalsForEval, *, allow_complex=False
) -> tuple[sympy.Expr, str]:
    # Replace '^' with '**' wherever it appears. In MATLAB, either can be used
    # for exponentiation. In Python, only the latter can be used.
    expr = pl.full_unidecode(greek_unicode_transform(expr)).replace("^", "**")

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

    transformations = standard_transformations + (implicit_multiplication_application,)

    try:
        code = stringify_expr(expr, local_dict, global_dict, transformations)
    except TokenError:
        raise HasParseError(-1)

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

    ast_check(code, parsed_locals_to_eval)

    # Now that it's safe, get sympy expression
    try:
        res = eval_expr(code, local_dict, global_dict)
    except Exception:
        raise BaseSympyError()

    # Finally, check for invalid symbols
    sympy_check(res, locals_for_eval, allow_complex=allow_complex)

    return res, code


def convert_string_to_sympy(
    expr: str,
    variables: None | list[str] = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: None | list[str] = None,
    assumptions: None | AssumptionsDictT = None,
) -> sympy.Expr:
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
    variables: None | list[str] = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: None | list[str] = None,
    assumptions: None | AssumptionsDictT = None,
) -> tuple[sympy.Expr, str]:
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
            raise HasInvalidAssumption(
                f'Assumptions for variables that are not present: {",".join(unbound_variables)}'
            )

    # If there is a list of variables, add each one to the whitelist with assumptions
    if variables is not None:
        variable_dict = locals_for_eval["variables"]

        for variable in variables:
            variable = greek_unicode_transform(variable)
            # Check for naming conflicts
            if variable in used_names:
                raise HasConflictingVariable(f"Conflicting variable name: {variable}")
            else:
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
        for function in custom_functions:
            function = greek_unicode_transform(function)
            if function in used_names:
                raise HasConflictingFunction(f"Conflicting variable name: {function}")

            used_names.add(function)

            function_dict[function] = sympy.Function(function)

    # Do the conversion
    return evaluate_with_source(expr, locals_for_eval, allow_complex=allow_complex)


def point_to_error(expr: str, ind: int, w: int = 5) -> str:
    """Generate a string with a pointer to error in expr with index ind"""
    w_left: str = " " * (ind - max(0, ind - w))
    w_right: str = " " * (min(ind + w, len(expr)) - ind)
    initial: str = html.escape(expr[ind - len(w_left) : ind + len(w_right)])
    return f"{initial}\n{w_left}^{w_right}"


def sympy_to_json(
    a: sympy.Expr, *, allow_complex: bool = True, allow_trig_functions: bool = True
) -> SympyJson:
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
    a_sub = a.subs([(val, key) for key, val in const.hidden_variables.items()])
    if allow_complex:
        a_sub = a_sub.subs(
            [(val, key) for key, val in const.hidden_complex_variables.items()]
        )

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
    variables: None | list[str],
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: None | list[str] = None,
    imaginary_unit: None | str = None,
) -> None | str:
    """Tries to parse expr as a sympy expression. If it fails, returns a string with an appropriate error message for display on the frontend."""

    try:
        expr_parsed = convert_string_to_sympy(
            expr,
            variables,
            allow_hidden=allow_hidden,
            allow_complex=allow_complex,
            allow_trig_functions=allow_trig_functions,
            custom_functions=custom_functions,
        )
    except HasFloatError as err:
        return (
            f"Your answer contains the floating-point number {err.n}. "
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
    except HasInvalidExpressionError as err:
        return (
            f"Your answer has an invalid expression. "
            f"<br><br><pre>{point_to_error(expr, err.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasInvalidFunctionError as err:
        return (
            f'Your answer calls an invalid function "{err.text}". '
            f"<br><br><pre>{point_to_error(expr, err.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasInvalidVariableError as err:
        return (
            f'Your answer refers to an invalid variable "{err.text}". '
            f"<br><br><pre>{point_to_error(expr, err.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except FunctionNameUsedWithoutArguments as err:
        return (
            f'Your answer mentions the function "{err.text}" without '
            "applying it to anything. "
            f"<br><br><pre>{point_to_error(expr, err.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasInvalidSymbolError as err:
        return (
            f'Your answer refers to an invalid symbol "{err.symbol}". '
            f"<br><br><pre>{point_to_error(expr, -1)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasParseError as err:
        return (
            f"Your answer has a syntax error. "
            f"<br><br><pre>{point_to_error(expr, err.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasEscapeError as err:
        return (
            f'Your answer must not contain the character "\\". '
            f"<br><br><pre>{point_to_error(expr, err.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasCommentError as err:
        return (
            f'Your answer must not contain the character "#". '
            f"<br><br><pre>{point_to_error(expr, err.offset)}</pre>"
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
            f"(denoted ${imaginary_unit:s}$): $${sympy.latex(expr_parsed):s}$$"
        )

    return None


def get_items_list(items_string: None | str) -> list[str]:
    if items_string is None:
        return []

    return list(map(str.strip, items_string.split(",")))


def greek_unicode_transform(input_str: str) -> str:
    """
    Return input_str where all unicode greek letters are replaced
    by their spelled-out english names.
    """
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
        "\u039A": "Kappa",
        "\u039B": "Lamda",
        "\u039C": "Mu",
        "\u039D": "Nu",
        "\u039E": "Xi",
        "\u039F": "Omicron",
        "\u03A0": "Pi",
        "\u03A1": "Rho",
        "\u03A3": "Sigma",
        "\u03A4": "Tau",
        "\u03A5": "Upsilon",
        "\u03A6": "Phi",
        "\u03A7": "Chi",
        "\u03A8": "Psi",
        "\u03A9": "Omega",
        "\u03B1": "alpha",
        "\u03B2": "beta",
        "\u03B3": "gamma",
        "\u03B4": "delta",
        "\u03B5": "epsilon",
        "\u03B6": "zeta",
        "\u03B7": "eta",
        "\u03B8": "theta",
        "\u03B9": "iota",
        "\u03BA": "kappa",
        "\u03BB": "lamda",
        "\u03BC": "mu",
        "\u03BD": "nu",
        "\u03BE": "xi",
        "\u03BF": "omicron",
        "\u03C0": "pi",
        "\u03C1": "rho",
        "\u03C3": "sigma",
        "\u03C4": "tau",
        "\u03C5": "upsilon",
        "\u03C6": "phi",
        "\u03C7": "chi",
        "\u03C8": "psi",
        "\u03C9": "omega",
    }

    return "".join(greek_alphabet.get(c, c) for c in input_str)
