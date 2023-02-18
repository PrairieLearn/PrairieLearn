import ast
from dataclasses import dataclass
from typing import (
    Any,
    Callable,
    Dict,
    List,
    Literal,
    Optional,
    Tuple,
    Type,
    TypedDict,
    Union,
    cast,
)

import sympy

SympyMapT = Dict[str, Union[Callable, sympy.Basic]]
ASTWhitelistT = Tuple[Type[ast.AST], ...]


class SympyJson(TypedDict):
    """A class with type signatures for the sympy json dict"""

    _type: Literal["sympy"]
    _value: str
    _variables: List[str]


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

        self.variables = {
            "pi": sympy.pi,
            "e": sympy.E,
        }

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


@dataclass
class HasFloatError(BaseSympyError):
    offset: int
    n: float


@dataclass
class HasComplexError(BaseSympyError):
    offset: int
    n: complex


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
class HasParseError(BaseSympyError):
    offset: int


@dataclass
class HasEscapeError(BaseSympyError):
    offset: int


@dataclass
class HasCommentError(BaseSympyError):
    offset: int


class CheckNumbers(ast.NodeTransformer):
    def visit_Constant(self, node: ast.Constant) -> ast.Constant:
        if isinstance(node.n, int):
            return cast(
                ast.Constant,
                ast.Call(
                    func=ast.Name(id="_Integer", ctx=ast.Load()),
                    args=[node],
                    keywords=[],
                ),
            )
        elif isinstance(node.n, float):
            raise HasFloatError(node.col_offset, node.n)
        elif isinstance(node.n, complex):
            raise HasComplexError(node.col_offset, node.n)
        return node


class CheckWhiteList(ast.NodeVisitor):
    def __init__(self, whitelist: ASTWhitelistT) -> None:
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
        if isinstance(node.func, ast.Name):
            if node.func.id not in self.functions:
                err_node = get_parent_with_location(node)
                raise HasInvalidFunctionError(err_node.col_offset, err_node.func.id)
        self.generic_visit(node)


class CheckVariables(ast.NodeVisitor):
    def __init__(self, variables: SympyMapT) -> None:
        self.variables = variables

    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, ast.Load):
            if not is_name_of_function(node):
                if node.id not in self.variables:
                    err_node = get_parent_with_location(node)
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


def evaluate(expr: str, locals_for_eval: LocalsForEval) -> sympy.Expr:
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
    CheckVariables(locals_for_eval["variables"]).visit(root)

    # Disallow AST nodes that are not in whitelist
    #
    # Be very careful about adding to the list below. In particular,
    # do not add `ast.Attribute` without fully understanding the
    # reflection-based attacks described by
    # https://nedbatchelder.com/blog/201206/eval_really_is_dangerous.html
    # http://blog.delroth.net/2013/03/escaping-a-python-sandbox-ndh-2013-quals-writeup/
    #
    whitelist: ASTWhitelistT = (
        ast.Module,
        ast.Expr,
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

    # Disallow float and complex, and replace int with sympy equivalent
    root = CheckNumbers().visit(root)

    # Clean up lineno and col_offset attributes
    ast.fix_missing_locations(root)

    # Convert AST to code and evaluate it with no global expressions and with
    # a whitelist of local expressions. Flattens out the inner dictionaries
    # that appear in locals_for_eval for the final call to eval.
    locals = {
        name: expr
        for local_expressions in locals_for_eval.values()
        for name, expr in cast(SympyMapT, local_expressions).items()
    }

    return eval(compile(root, "<ast>", "eval"), {"__builtins__": None}, locals)


def convert_string_to_sympy(
    expr: str,
    variables: Optional[List[str]],
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
) -> sympy.Expr:
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

    # If there is a list of variables, add each one to the whitelist
    if variables is not None:
        locals_for_eval["variables"].update(
            (variable, sympy.Symbol(variable)) for variable in variables
        )

    # Do the conversion
    return evaluate(expr, locals_for_eval)


def point_to_error(expr: str, ind: int, w: int = 5) -> str:
    """Generate a string with a pointer to error in expr with index ind"""
    w_left: str = " " * (ind - max(0, ind - w))
    w_right: str = " " * (min(ind + w, len(expr)) - ind)
    initial: str = expr[ind - len(w_left) : ind + len(w_right)]
    return f"{initial}\n{w_left}^{w_right}"


def sympy_to_json(
    a: sympy.Expr, *, allow_complex: bool = True, allow_trig_functions: bool = True
) -> SympyJson:
    const = _Constants()

    # Get list of variables in the sympy expression
    variables = list(map(str, a.free_symbols))

    # Check that variables do not conflict with reserved names
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

    # Check if reserved variables conflict, raise an error if they do
    conflicting_reserved_variables = reserved & set(variables)

    if conflicting_reserved_variables:
        raise ValueError(
            f"sympy expression has variables with reserved names: {conflicting_reserved_variables}"
        )

    # Apply substitutions for hidden variables
    a_sub = a.subs([(val, key) for key, val in const.hidden_variables.items()])
    if allow_complex:
        a_sub = a_sub.subs(
            [(val, key) for key, val in const.hidden_complex_variables.items()]
        )

    return {"_type": "sympy", "_value": str(a_sub), "_variables": variables}


def json_to_sympy(
    a: SympyJson, *, allow_complex: bool = True, allow_trig_functions: bool = True
) -> sympy.Expr:
    if "_type" not in a:
        raise ValueError("json must have key _type for conversion to sympy")
    if a["_type"] != "sympy":
        raise ValueError('json must have _type == "sympy" for conversion to sympy')
    if "_value" not in a:
        raise ValueError("json must have key _value for conversion to sympy")
    if "_variables" not in a:
        a["_variables"] = None

    return convert_string_to_sympy(
        a["_value"],
        a["_variables"],
        allow_hidden=True,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig_functions,
    )


def validate_string_as_sympy(
    expr: str,
    variables: Optional[List[str]],
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
    imaginary_unit: Optional[str] = None,
) -> Optional[str]:
    """Tries to parse expr as a sympy expression. If it fails, returns a string with an appropriate error message for display on the frontend."""

    try:
        expr_parsed = convert_string_to_sympy(
            expr,
            variables,
            allow_hidden=allow_hidden,
            allow_complex=allow_complex,
            allow_trig_functions=allow_trig_functions,
        )
    except HasFloatError as err:
        return (
            f"Your answer contains the floating-point number {err.n}. "
            f"All numbers must be expressed as integers (or ratios of integers)"
            f"<br><br><pre>{point_to_error(expr, err.offset)}</pre>"
            "Note that the location of the syntax error is approximate."
        )
    except HasComplexError as err:
        err_string = [
            f"Your answer contains the complex number {err.n}. "
            "All numbers must be expressed as integers (or ratios of integers). "
        ]

        if allow_complex:
            err_string.append(
                "To include a complex number in your expression, write it as the product "
                "of an integer with the imaginary unit <code>i</code> or <code>j</code>."
            )

        err_string.append(f"<br><br><pre>{point_to_error(expr, err.offset)}</pre>")
        err_string.append("Note that the location of the syntax error is approximate.")
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


def get_variables_list(variables_string: Optional[str]) -> List[str]:
    if variables_string is None:
        return []

    return list(map(str.strip, variables_string.split(",")))


def process_student_input(student_input: str) -> str:
    # Replace '^' with '**' wherever it appears. In MATLAB, either can be used
    # for exponentiation. In Python, only the latter can be used.
    a_sub = student_input.replace("^", "**")

    # Replace Unicode minus with hyphen minus wherever it occurs
    a_sub = a_sub.replace("\u2212", "-")

    # Strip whitespace
    return a_sub.strip()
