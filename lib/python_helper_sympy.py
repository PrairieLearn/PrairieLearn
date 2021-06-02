import sympy
import ast
import sys

MAX_FUNCTION_NAME_LENGTH = 6

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
            'cos': sympy.cos,
            'sin': sympy.sin,
            'tan': sympy.tan,
            'sec': sympy.sec,
            'csc': sympy.csc,
            'cot': sympy.cot,
            'arccos': sympy.acos,
            'arcsin': sympy.asin,
            'arctan': sympy.atan,
            'atan2': sympy.atan2,
            'exp': sympy.exp,
            'log': sympy.log,
            'ln': lambda x: sympy.log(x, sympy.E),
            'sqrt': sympy.sqrt,
            're': sympy.re,
            'im': sympy.im,
            'max': sympy.Max,
            'min': sympy.Min,
        }

    def get_supported_function_names(self):
        return list(self.functions.keys())

    def add_new_operator_names(self, opNamesList):
        for opName in list(opNamesList):
            if opName not in self.functions.keys():
                sympyDummyFunc = sympy.Function(opName) 
                self.functions.update({ opName : sympyDummyFunc })
        return self

    def enable_extended_function_names(self):
        extended_func_names_dict = {
            'cosh':  sympy.cosh, 
            'sinh':  sympy.sinh,
            'tanh':  sympy.tanh,
            'sech':  sympy.sech,
            'csch':  sympy.csch,
            'coth':  sympy.coth,
            'acosh': sympy.acosh,
            'asinh': sympy.asinh,
            'atanh': sympy.atanh,
            'asech': sympy.asech,
            'acsch': sympy.acsch,
            'acoth': sympy.acoth,
            'sgn':   sympy.sign,
            'abs':   sympy.Abs,
            'arg':   sympy.arg,
            'ceil':  sympy.ceiling,
            'floor': sympy.floor,
            'frac':  sympy.frac,
        }
        for funcName in extended_func_names_dict.keys():
            self.functions.update({ funcName : extended_func_names_dict[funcName] })
        return self

CONSTANTS_INSTANCE = _Constants()

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

class Error(Exception):
    def __init__(self, offset, extra_msg = None):
        if extra_msg != None:
            self.message += " [EXTRA-MSG: %s]" % extra_msg
        self.offset = offset

class HasFloatError(Error):
    def __init__(self, offset, n):
        super(HasFloatError, self).__init__(offset)
        self.n = n

class HasComplexError(Error):
    def __init__(self, offset, n):
        super(HasComplexError, self).__init__(offset)
        self.n = n

class HasInvalidExpressionError(Error):
    pass

class HasInvalidFunctionError(Error):
    def __init__(self, offset, text, ctx = None):
        if ctx != None:
            super(HasInvalidFunctionError, self).__init__(offset, str(ctx))
        else:
            super(HasInvalidFunctionError, self).__init__(offset)
        self.text = text

class HasInvalidVariableError(Error):
    def __init__(self, offset, text):
        super(HasInvalidVariableError, self).__init__(offset)
        self.text = text

class HasParseError(Error):
    pass

class HasEscapeError(Error):
    pass

class HasCommentError(Error):
    pass

class CheckNumbers(ast.NodeTransformer):
    def visit_Num(self, node):
        if isinstance(node.n, int):
            return ast.Call(func=ast.Name(id='_Integer', ctx=ast.Load()), args=[node], keywords=[])
        elif isinstance(node.n, float):
            raise HasFloatError(node.col_offset, node.n)
        elif isinstance(node.n, complex):
            raise HasComplexError(node.col_offset, node.n)
        return node

class CheckWhiteList(ast.NodeVisitor):
    def __init__(self, whitelist):
        self.whitelist = whitelist

    def visit(self, node):
        if not isinstance(node, self.whitelist):
            node = get_parent_with_location(node)
            raise HasInvalidExpressionError(node.col_offset)
        return super().visit(node)

class CheckFunctions(ast.NodeVisitor):
    def __init__(self, functions):
        self.functions = functions
    def visit_Call(self, node):
        if isinstance(node.func, ast.Name):
            if node.func.id not in self.functions:
                node = get_parent_with_location(node)
                raise HasInvalidFunctionError(node.col_offset, node.func.id)
        self.generic_visit(node)

class CheckVariables(ast.NodeVisitor):
    def __init__(self, variables):
        self.variables = variables
    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            if not is_name_of_function(node):
                if node.id not in self.variables:
                    node = get_parent_with_location(node)
                    raise HasInvalidVariableError(node.col_offset, node.id)
        self.generic_visit(node)

def is_name_of_function(node):
    # The node is the name of a function if all of the following are true:
    # 1) it has type ast.Name
    # 2) its parent has type ast.Call
    # 3) it is not in the list of parent's args
    return isinstance(node, ast.Name) and isinstance(node.parent, ast.Call) and (node not in node.parent.args)

def get_parent_with_location(node):
    if hasattr(node, 'col_offset'):
        return node
    else:
        return get_parent_with_location(node.parent)

def evaluate(expr, locals_for_eval={}):

    # Disallow escape character
    if '\\' in expr:
        raise HasEscapeError(expr.find('\\'))

    # Disallow comment character
    if '#' in expr:
        raise HasCommentError(expr.find('#'))

    # Parse (convert string to AST)
    try:
        root = ast.parse(expr, mode='eval')
    except Exception as err:
        raise HasParseError(err.offset)

    # Link each node to its parent
    for node in ast.walk(root):
        for child in ast.iter_child_nodes(node):
            child.parent = node

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
    whitelist = (ast.Module, ast.Expr, ast.Load, ast.Expression, ast.Call, ast.Name, ast.Num, ast.UnaryOp, ast.UAdd, ast.USub, ast.BinOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow)
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

def convert_string_to_sympy_with_context(a, variables, const, allow_hidden=False, allow_complex=False):
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

    # If there is a list of variables, add each one to the whitelist
    if variables is not None:
        for variable in variables:
            locals_for_eval['variables'][variable] = sympy.Symbol(variable)
    # And similarly for the function names:
    if const.functions is not None:
        for func in const.functions.keys():
            locals_for_eval['functions'][func] = sympy.Function(func)

    # Do the conversion
    return evaluate(a, locals_for_eval)

def convert_string_to_sympy(a, variables, allow_hidden=False, allow_complex=False):
    consts = _Constants()
    return convert_string_to_sympy_with_context(a, variables, consts, allow_hidden=allow_hidden, allow_complex=allow_complex)

def point_to_error(s, ind, w = MAX_FUNCTION_NAME_LENGTH):
    w_left = ind - max(0, ind-w)
    w_right = min(ind+w, len(s)) - ind
    return s[ind-w_left:ind+w_right] + '\n' + ' '*w_left + '^' + ' '*w_right

def sympy_to_json_with_context(a, const, allow_complex=True):
    # Get list of variables in the sympy expression
    variables = [str(v) for v in a.free_symbols]

    # Check that variables do not conflict with reserved names
    reserved = {**const.helpers, **const.variables, **const.hidden_variables, **const.functions}
    if allow_complex:
        reserved = {**reserved, **const.complex_variables, **const.hidden_complex_variables}
    for k in reserved.keys():
        for v in variables:
            if k == v:
                raise ValueError('sympy expression has a variable with a reserved name: {:s}'.format(k))

    # Apply substitutions for hidden variables
    a = a.subs([(const.hidden_variables[key], key) for key in const.hidden_variables.keys()])
    if allow_complex:
        a = a.subs([(const.hidden_complex_variables[key], key) for key in const.hidden_complex_variables.keys()])

    return {'_type': 'sympy', '_value': str(a), '_variables': variables}

def sympy_to_json(a, allow_complex=True):
    consts = _Constants()
    return sympy_to_json_with_context(a, consts, allow_complex = allow_complex)

def json_to_sympy_with_context(a, const, allow_complex=True):
    if not '_type' in a:
        raise ValueError('json must have key _type for conversion to sympy')
    if a['_type'] != 'sympy':
        raise ValueError('json must have _type == "sympy" for conversion to sympy')
    if not '_value' in a:
        raise ValueError('json must have key _value for conversion to sympy')
    if not '_variables' in a:
        a['_variables'] = None

    return convert_string_to_sympy_with_context(a['_value'], a['_variables'], const, allow_hidden=True, allow_complex=allow_complex)

def json_to_sympy(a, allow_complex=True):
    consts = _Constants()
    return json_to_sympy_with_context(a, consts, allow_complex=allow_complex)
