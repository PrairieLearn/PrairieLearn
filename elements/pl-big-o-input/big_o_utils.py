from typing import Callable, List, Tuple, Dict, Any
import sympy
import python_helper_sympy as phs

SympyMap = Dict[str, Any]
ASTWhitelist = Tuple[Any, ...]
BigoGradingFunctionT = Callable[[str, str, List[str]], Tuple[float, str]]

# See https://github.com/PrairieLearn/PrairieLearn/blob/d10be38fec52929386efb67cce645cd615d589a5/python/python_helper_sympy.py
# This is a stripped down version that adds factorial but remotes trig and complex numbers.

"""
@dataclass
class _Constants:
    helpers: SympyMap = field(
        default_factory=lambda: {
            '_Integer': sympy.Integer,
        }
    )
    variables: SympyMap = field(
        default_factory=lambda: {
            'pi': sympy.pi,
            'e': sympy.E,
        }
    )
    functions: SympyMap = field(
        default_factory=lambda: {
            'exp': sympy.exp,
            'log': sympy.log,
            'sqrt': sympy.sqrt,
            'factorial': sympy.factorial
        }
    )


@dataclass
class HasFloatError(Exception):
    offset: int
    n: float


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
    def visit_Constant(self, node: ast.Constant):
        if isinstance(node.n, int):
            return ast.Call(func=ast.Name(id='_Integer', ctx=ast.Load()), args=[node], keywords=[])
        elif isinstance(node.n, float):
            raise HasFloatError(node.col_offset, node.n)
        return node


class CheckWhiteList(ast.NodeVisitor):
    def __init__(self, whitelist: ASTWhitelist):
        self.whitelist: ASTWhitelist = whitelist

    def visit(self, node: Any):
        if not isinstance(node, self.whitelist):
            node = get_parent_with_location(node)
            raise HasInvalidExpressionError(node.col_offset)
        return super().visit(node)


class CheckFunctions(ast.NodeVisitor):
    def __init__(self, functions: Dict[Any, Any]):
        self.functions = functions

    def visit_Call(self, node: Any):
        if isinstance(node.func, ast.Name):
            if node.func.id not in self.functions:
                node = get_parent_with_location(node)
                raise HasInvalidFunctionError(node.col_offset, node.func.id)
        self.generic_visit(node)


class CheckVariables(ast.NodeVisitor):
    def __init__(self, variables: SympyMap):
        self.variables: SympyMap = variables

    def visit_Name(self, node: Any):
        if isinstance(node.ctx, ast.Load):
            if not is_name_of_function(node):
                if node.id not in self.variables:
                    node = get_parent_with_location(node)
                    raise HasInvalidVariableError(node.col_offset, node.id)
        self.generic_visit(node)


def is_name_of_function(node: Any) -> bool:
    return isinstance(node, ast.Name) and isinstance(node.parent, ast.Call) and (node not in node.parent.args)  # type: ignore


def get_parent_with_location(node: ast.AST) -> ast.AST:
    if hasattr(node, 'col_offset'):
        return node
    else:
        return get_parent_with_location(node.parent)  # type: ignore


def evaluate(expr: str, locals_for_eval: Dict[str, Any] = {}) -> Any:

    # Disallow escape character
    ind = expr.find('\\')
    if ind != -1:
        raise HasEscapeError(ind)

    # Disallow comment character
    ind = expr.find('#')
    if ind != -1:
        raise HasCommentError(ind)

    try:
        root = ast.parse(expr, mode='eval')
    except Exception as err:
        raise HasParseError(err.offset)  # type: ignore

    for node in ast.walk(root):
        for child in ast.iter_child_nodes(node):
            child.parent = node  # type: ignore

    CheckFunctions(locals_for_eval['functions']).visit(root)
    CheckVariables(locals_for_eval['variables']).visit(root)

    whitelist: ASTWhitelist = (ast.Module, ast.Expr, ast.Load, ast.Expression, ast.Call, ast.Name, ast.Constant, ast.UnaryOp, ast.UAdd, ast.USub, ast.BinOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow)
    CheckWhiteList(whitelist).visit(root)

    root = CheckNumbers().visit(root)

    ast.fix_missing_locations(root)

    locals: Dict[Any, Any] = {k: locals_for_eval[key][k] for key in locals_for_eval for k in locals_for_eval[key].keys()}
    return eval(compile(root, '<ast>', 'eval'), {'__builtins__': None}, locals)


def phs.convert_string_to_sympy(expr: str, variables: List[str]) -> Any:
    const = _Constants()

    locals_for_eval = {
        'functions': const.functions,
        'variables': const.variables,
        'helpers': const.helpers
    }

    if variables is not None:
        for variable in variables:
            locals_for_eval['variables'][variable] = sympy.Symbol(variable)
    return evaluate(expr, locals_for_eval)
"""


def grade_bigo_expression(a_true: str, a_sub: str, variables: List[str]) -> Tuple[float, str]:
    if a_true == a_sub:
        return (1, 'Correct!')

    sym_true = phs.convert_string_to_sympy(a_true, variables, allow_complex=False, allow_trig_functions=False)
    sym_sub = phs.convert_string_to_sympy(a_sub, variables, allow_complex=False, allow_trig_functions=False)

    if sym_true.equals(sym_sub):
        return (1, 'Correct! Note that your expression may be unnecessarily complex.')

    if (sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0)):
        return (0, 'Your expression is negative.')

    L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if L < sympy.sympify(0):
        return (0, 'Your expression is negative.')
    elif L == sympy.oo:
        return (0, 'Your answer is incorrect.')
    elif L == sympy.sympify(0):
        return (.25, 'Your answer is correct, but too loose.')
    elif L == sympy.sympify(1):
        return (.5, 'Your answer is correct, but you have unnecessary lower order terms.')
    else:
        return (.5, 'Your answer is correct but has unncessary constant factors.')


def grade_theta_expression(a_true: str, a_sub: str, variables: List[str]) -> Tuple[float, str]:
    if a_true == a_sub:
        return (1, 'Correct!')

    sym_true = phs.convert_string_to_sympy(a_true, variables, allow_complex=False, allow_trig_functions=False)
    sym_sub = phs.convert_string_to_sympy(a_sub, variables, allow_complex=False, allow_trig_functions=False)

    if sym_true.equals(sym_sub):
        return (1, 'Correct! Note that your expression may be unnecessarily complex.')

    if (sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0)):
        return (0, 'Your expression is negative.')

    omega_L = sympy.limit(sym_sub / sym_true, sympy.Symbol(variables[0]), sympy.oo)
    bigo_L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if omega_L < sympy.sympify(0) or bigo_L < sympy.sympify(0):
        return (0, 'Your expression is negative.')
    elif omega_L == sympy.oo or bigo_L == sympy.oo:
        return (0, 'Your answer is incorrect.')
    elif omega_L == sympy.sympify(1) and bigo_L == sympy.sympify(1):
        return (0.25, 'Incorrect, your answer has unnecessary lower order terms.')
    else:
        return (0.25, 'Incorrect, your answer has unnecessary constant factors.')


def grade_omega_expression(a_true: str, a_sub: str, variables: List[str]) -> Tuple[float, str]:
    if a_true == a_sub:
        return (1, 'Correct!')

    sym_true = phs.convert_string_to_sympy(a_true, variables, allow_complex=False, allow_trig_functions=False)
    sym_sub = phs.convert_string_to_sympy(a_sub, variables, allow_complex=False, allow_trig_functions=False)

    if sym_true.equals(sym_sub):
        return (1, 'Correct! Note that your expression may be unnecessarily complex.')

    if (sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0)):
        return (0, 'Your expression is negative.')

    L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if L < sympy.sympify(0):
        return (0, 'Your expression is negative.')
    elif L == sympy.oo:
        return (0.25, 'Your answer is correct, but too loose.')
    elif L == sympy.sympify(0):
        return (0, 'Your answer is incorrect.')
    elif L == sympy.sympify(1):
        return (.5, 'Your answer is correct, but you have unnecessary lower order terms.')
    else:
        return (.5, 'Your answer is correct but has unncessary constant factors.')


def grade_little_o_expression(a_true: str, a_sub: str, variables: List[str]) -> Tuple[float, str]:
    if a_true == a_sub:
        return (1, 'Correct!')

    sym_true = phs.convert_string_to_sympy(a_true, variables, allow_complex=False, allow_trig_functions=False)
    sym_sub = phs.convert_string_to_sympy(a_sub, variables, allow_complex=False, allow_trig_functions=False)

    if sym_true.equals(sym_sub):
        return (1, 'Correct! Note that your expression may be unnecessarily complex.')

    if (sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0)):
        return (0, 'Your expression is negative.')

    L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if L < sympy.sympify(0):
        return (0, 'Your expression is negative.')
    elif L == sympy.oo:
        return (0, 'Your answer is incorrect.')
    elif L == sympy.sympify(0):
        return (.25, 'Your answer is correct, but too loose.')
    elif L == sympy.sympify(1):
        return (.5, 'Your answer is correct, but you have unnecessary lower order terms.')
    else:
        return (.5, 'Your answer is correct but has unncessary constant factors.')


def grade_little_omega_expression(a_true: str, a_sub: str, variables: List[str]) -> Tuple[float, str]:
    if a_true == a_sub:
        return (1, 'Correct!')

    sym_true = phs.convert_string_to_sympy(a_true, variables, allow_complex=False, allow_trig_functions=False)
    sym_sub = phs.convert_string_to_sympy(a_sub, variables, allow_complex=False, allow_trig_functions=False)

    if sym_true.equals(sym_sub):
        return (1, 'Correct! Note that your expression may be unnecessarily complex.')

    if (sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0)):
        return (0, 'Your expression is negative.')

    L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if L < sympy.sympify(0):
        return (0, 'Your expression is negative.')
    elif L == sympy.oo:
        return (0.25, 'Your answer is correct, but too loose.')
    elif L == sympy.sympify(0):
        return (0, 'Your answer is incorrect.')
    elif L == sympy.sympify(1):
        return (.5, 'Your answer is correct, but you have unnecessary lower order terms.')
    else:
        return (.5, 'Your answer is correct but has unncessary constant factors.')
