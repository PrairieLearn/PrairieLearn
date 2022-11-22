import sympy
import ast
from dataclasses import dataclass
from typing import Any, cast, Dict, List, Tuple, TypedDict, Literal

SympyMapT = Dict[str, Any]
ASTWhitelistT = Tuple[Any, ...]

class SympyJson(TypedDict):
    "A class with type signatures for the sympy json dict"
    _type: Literal['sympy']
    _value: str
    _variables: List[str]

    #{'_type': 'sympy', '_value': str(a), '_variables': variables}


# Create a new instance of this class to access the member dictionaries. This
# is to avoid accidentally modifying these dictionaries.
class _Constants:
    def __init__(self):
        self.helpers = {
            '_Integer': sympy.Integer,
        }
        self.variables = {
            'pi': sympy.pi,
            'e': sympy.E,
        }
        self.hidden_variables = {
            '_Exp1': sympy.E,
        }
        self.complex_variables = {
            'i': sympy.I,
            'j': sympy.I,
        }
        self.hidden_complex_variables = {
            '_ImaginaryUnit': sympy.I,
        }
        self.functions = {
            # These are shown to the student
            'exp': sympy.exp,
            'log': sympy.log,
            'sqrt': sympy.sqrt,
            'factorial': sympy.factorial
        }
        self.trig_functions = {
            'cos': sympy.cos,
            'sin': sympy.sin,
            'tan': sympy.tan,
            'arccos': sympy.acos,
            'arcsin': sympy.asin,
            'arctan': sympy.atan,
            'acos': sympy.acos,
            'asin': sympy.asin,
            'atan': sympy.atan,
            'arctan2': sympy.atan2,
            'atan2': sympy.atan2,
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

@dataclass
class HasFloatError(Exception):
    offset: int
    n: float

@dataclass
class HasComplexError(Exception):
    offset:int
    n: str

@dataclass
class HasInvalidExpressionError(Exception):
    offset: int


@dataclass
class HasInvalidFunctionError(Exception):
    offset: int
    text: str


@dataclass
class HasInvalidVariableError(Exception):
    offset: int
    text: str


@dataclass
class HasParseError(Exception):
    offset: int


@dataclass
class HasEscapeError(Exception):
    offset: int


@dataclass
class HasCommentError(Exception):
    offset: int

class CheckNumbers(ast.NodeTransformer):
    def visit_Num(self, node: ast.Constant) -> ast.Constant:
        if isinstance(node.n, int):
            return cast(ast.Constant, ast.Call(func=ast.Name(id='_Integer', ctx=ast.Load()), args=[node], keywords=[]))
        elif isinstance(node.n, float):
            raise HasFloatError(node.col_offset, node.n)
        elif isinstance(node.n, complex):
            raise HasComplexError(node.col_offset, str(node.n))
        return node

class CheckWhiteList(ast.NodeVisitor):
    def __init__(self, whitelist: ASTWhitelistT) -> None:
        self.whitelist = whitelist

    def visit(self, node: Any) -> Any:
        if not isinstance(node, self.whitelist):
            node = get_parent_with_location(node)
            raise HasInvalidExpressionError(node.col_offset)
        return super().visit(node)

class CheckFunctions(ast.NodeVisitor):
    def __init__(self, functions: SympyMapT) -> None:
        self.functions = functions

    def visit_Call(self, node: Any) -> Any:
        if isinstance(node.func, ast.Name):
            if node.func.id not in self.functions:
                node = get_parent_with_location(node)
                raise HasInvalidFunctionError(node.col_offset, node.func.id)
        self.generic_visit(node)

class CheckVariables(ast.NodeVisitor):
    def __init__(self, variables: SympyMapT) -> None:
        self.variables = variables

    def visit_Name(self, node: Any) -> Any:
        if isinstance(node.ctx, ast.Load):
            if not is_name_of_function(node):
                if node.id not in self.variables:
                    node = get_parent_with_location(node)
                    raise HasInvalidVariableError(node.col_offset, node.id)
        self.generic_visit(node)

def is_name_of_function(node: Any) -> bool:
    # The node is the name of a function if all of the following are true:
    # 1) it has type ast.Name
    # 2) its parent has type ast.Call
    # 3) it is not in the list of parent's args
    return isinstance(node, ast.Name) and isinstance(node.parent, ast.Call) and (node not in node.parent.args) # type: ignore

def get_parent_with_location(node: ast.AST) -> ast.AST:
    if hasattr(node, 'col_offset'):
        return node
    else:
        return get_parent_with_location(node.parent) # type: ignore

def evaluate(expr: str, locals_for_eval: SympyMapT={}) -> sympy.Expr:

    # Disallow escape character
    if '\\' in expr:
        raise HasEscapeError(expr.find('\\'))

    # Disallow comment character
    if '#' in expr:
        raise HasCommentError(expr.find('#'))

    # Parse (convert string to AST)
    try:
        root = ast.parse(expr, mode='eval')
    except SyntaxError as err:
        offset = err.offset if err.offset is not None else -1
        raise HasParseError(offset)

    # Link each node to its parent
    for node in ast.walk(root):
        for child in ast.iter_child_nodes(node):
            child.parent = node  # type: ignore

    # Disallow functions that are not in locals_for_eval
    CheckFunctions(locals_for_eval['functions']).visit(root)

    # Disallow variables that are not in locals_for_eval
    CheckVariables(locals_for_eval['variables']).visit(root)

    # Disallow AST nodes that are not in whitelist
    #
    # Be very careful about adding to the list below. In particular,
    # do not add `ast.Attribute` without fully understanding the
    # reflection-based attacks described by
    # https://nedbatchelder.com/blog/201206/eval_really_is_dangerous.html
    # http://blog.delroth.net/2013/03/escaping-a-python-sandbox-ndh-2013-quals-writeup/
    #
    whitelist: ASTWhitelistT = (ast.Module, ast.Expr, ast.Load, ast.Expression, ast.Call, ast.Name, ast.Num, ast.Constant, ast.UnaryOp, ast.UAdd, ast.USub, ast.BinOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow)

    CheckWhiteList(whitelist).visit(root)

    # Disallow float and complex, and replace int with sympy equivalent
    root = CheckNumbers().visit(root)

    # Clean up lineno and col_offset attributes
    ast.fix_missing_locations(root)

    # Convert AST to code and evaluate it with no global expressions and with
    # a whitelist of local expressions
    locals = {}
    for key in locals_for_eval:
        locals = {**locals, **locals_for_eval[key]}
    return eval(compile(root, '<ast>', 'eval'), {'__builtins__': None}, locals)

def convert_string_to_sympy(expr: str, variables: List[str], *, allow_hidden: bool=False, allow_complex: bool=False, allow_trig_functions: bool=True) -> sympy.Expr:
    const = _Constants()

    # Create a whitelist of valid functions and variables (and a special flag
    # for numbers that are converted to sympy integers).
    locals_for_eval = {
        'functions': const.functions,
        'variables': const.variables,
        'helpers': const.helpers,
    }
    if allow_hidden:
        locals_for_eval['variables'] = {**locals_for_eval['variables'], **const.hidden_variables}
    if allow_complex:
        locals_for_eval['variables'] = {**locals_for_eval['variables'], **const.complex_variables}
        if allow_hidden:
            locals_for_eval['variables'] = {**locals_for_eval['variables'], **const.hidden_complex_variables}

    if allow_trig_functions:
        locals_for_eval['functions'] = {**locals_for_eval['functions'], **const.trig_functions}

    # If there is a list of variables, add each one to the whitelist
    if variables is not None:
        for variable in variables:
            locals_for_eval['variables'][variable] = sympy.Symbol(variable)

    # Do the conversion
    return evaluate(expr, locals_for_eval)

def point_to_error(s: str, ind: int, w: int = 5) -> str:
    w_left: str = ' ' * (ind - max(0, ind - w))
    w_right: str = ' ' * (min(ind + w, len(s)) - ind)
    initial: str = s[ind - len(w_left):ind + len(w_right)]
    return f'{initial}\n{w_left}^{w_right}'

def sympy_to_json(a: sympy.Expr, *, allow_complex: bool=True, allow_trig_functions: bool=True) -> SympyJson:
    const = _Constants()

    # Get list of variables in the sympy expression
    variables = [str(v) for v in a.free_symbols]

    # Check that variables do not conflict with reserved names
    reserved = {**const.helpers, **const.variables, **const.hidden_variables, **const.functions}
    if allow_complex:
        reserved = {**reserved, **const.complex_variables, **const.hidden_complex_variables}
    if allow_trig_functions:
        reserved = {**reserved, **const.trig_functions}

    for k in reserved.keys():
        for v in variables:
            if k == v:
                raise ValueError('sympy expression has a variable with a reserved name: {:s}'.format(k))

    # Apply substitutions for hidden variables
    a = a.subs([(const.hidden_variables[key], key) for key in const.hidden_variables.keys()])
    if allow_complex:
        a = a.subs([(const.hidden_complex_variables[key], key) for key in const.hidden_complex_variables.keys()])

    return {'_type': 'sympy', '_value': str(a), '_variables': variables}

def json_to_sympy(a: SympyJson, *, allow_complex: bool=True, allow_trig_functions: bool=True) -> sympy.Expr:
    if not '_type' in a:
        raise ValueError('json must have key _type for conversion to sympy')
    if a['_type'] != 'sympy':
        raise ValueError('json must have _type == "sympy" for conversion to sympy')
    if not '_value' in a:
        raise ValueError('json must have key _value for conversion to sympy')
    if not '_variables' in a:
        a['_variables'] = None

    return convert_string_to_sympy(a['_value'], a['_variables'], allow_hidden=True, allow_complex=allow_complex, allow_trig_functions=allow_trig_functions)
