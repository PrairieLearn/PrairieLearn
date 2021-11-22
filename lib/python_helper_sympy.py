import sympy
import sympy.abc as sympyabc
import ast
import sys
import python_helper_symbolic_types as phst
from sympy.utilities.lambdify import lambdify, implemented_function
from sympy.parsing.sympy_parser import parse_expr 

MAX_FUNCTION_NAME_LENGTH = phst.PLSymbolicFunctions.MAX_FUNCTION_NAME_LENGTH

# Create a new instance of this class to access the member dictionaries. This
# is to avoid accidentally modifying these dictionaries.
class _Constants:

    def __init__(self):
        self.helpers = {
            '_Integer': sympy.Integer,
            '_Float': sympy.Float,
            '_ManagedProperties': sympy.Symbol
        }
        self.variables = {
            'pi': sympy.pi,
            'e':  sympy.E,
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
            'cos'    : sympy.cos,
            'sin'    : sympy.sin,
            'exp'    : sympy.exp,
            'log'    : sympy.log,
            'cos'    : sympy.cos,
            'sin'    : sympy.sin,
            'tan'    : sympy.tan,
            'sec'    : sympy.sec,
            'csc'    : sympy.csc,
            'cot'    : sympy.cot,
            'arccos' : sympy.acos,
            'arcsin' : sympy.asin,
            'arctan' : sympy.atan,
            'atan2'  : sympy.atan2,
            # We need to add in recognition for sympy functions that are involved in constant expressions 
            # that are optionally enabled in the `pl-symbolic-input` element. Otherwise, parsing of these expressions 
            # will fail if they are not listed as known functions at runtime. This is a short list to include by default:
            'sqrt'   : sympy.sqrt,
            'log'    : sympy.log,
            'zeta'   : sympy.zeta,
        }

    def get_supported_function_names(self):
        return list(self.functions.keys())

    def get_supported_constant_names(self):
        return list(self.variables.keys())

    def add_new_operator_names(self, opNamesList):
        for opName in list(opNamesList):
            if opName not in self.functions.keys():
                self.functions[opName] = sympy.Function(opName)
        return self

    def enable_extended_func_names(self, extended_func_groups_list=None):
        if extended_func_groups_list is None or \
             (isinstance(extended_func_groups_list, str) and extended_func_groups_list.lower() == ""):
            return self
        elif isinstance(extended_func_groups_list, str) and extended_func_groups_list == "all":
            return self.enable_extended_function_names_by_dict( 
                extended_func_names_dict=phst.GetCustomFunctionsByGroup(funcGrpId=None)
            )
        extFuncGrpNames = [ funcGrp.strip().lower() for funcGrp in extended_func_groups_list.split(',') ]
        extFuncsDict = dict([])
        for funcGrpName in extFuncGrpNames:
            extFuncsDict.update( phst.GetCustomFunctionsByGroup(funcGrpId=funcGrpName) )
        return self.enable_extended_function_names_by_dict( 
                extended_func_names_dict=extFuncsDict
        )

    def enable_extended_function_names_by_dict(self, extended_func_names_dict={}):
        for funcName in extended_func_names_dict.keys():
            self.functions.update({ funcName : implemented_function(funcName, extended_func_names_dict[funcName]) })
        return self

    def enable_extended_symbolic_constants(self, problem_name, extended_constant_groups_list=None):
        if extended_constant_groups_list is None or \
            (isinstance(extended_constant_groups_list, str) and extended_constant_groups_list.lower() == ""):
            return self
        elif isinstance(extended_constant_groups_list, str) and extended_constant_groups_list.lower() == "all":
            return self.enable_extended_function_names_by_dict( 
                extended_var_names_dict=phst.GetConstantVariablesByGroup(cvarGrpId=None)
            )
        extFuncGrpNames = [ constGrp.strip().lower() for constGrp in extended_constant_groups_list.split(',') ]
        extFuncsDict = dict([])
        for funcGrpName in extFuncGrpNames:
            extFuncsDict.update( phst.GetConstantVariablesByGroup(cvarGrpId=funcGrpName) )
        return self.enable_extended_symbolic_constants_by_dict( 
                problem_name, extended_var_names_dict=extFuncsDict
        )

    def enable_extended_symbolic_constants_by_dict(self, problem_name, extended_var_names_dict={}):
        for constVarName in extended_var_names_dict.keys():
            self.variables.update({ constVarName : extended_var_names_dict[constVarName] })
        return self

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
    def __init__(self, offset):
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
        if ctx is not None:
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
    def visit_Expression(self, node):
        if not isinstance(node, phst.ScipyConstantValue):
            return node 
        if isinstance(node._evalf(), int):
            return ast.Call(func=ast.Name(id='_Integer', ctx=ast.Load()), args=[node._evalf()], keywords=[])
        elif isinstance(node._evalf(), float):
            return ast.Call(func=ast.Name(id='_Float', ctx=ast.Load()), args=[node._evalf()], keywords=[])
        return node

class CheckScipyTypes(ast.NodeTransformer):
    def visit_Mult(self, node):
        lorchild = tuple([ childNode for childNode in ast.iter_child_nodes(node) ])
        needsFix = True in [ isinstance(child, ManagedProperties) for child in lorchild ]
        if not needsFix:
            return node
        childNodes  = [ child for child in lorchild ]
        newNodeData = sympyOpType(*childNodes)
        replNode    =  ast.Call(func=ast.Name(id='_ManagedProperties', ctx=ast.Load()), args=[node], keywords=[])
        for child in childNodes:
            child.parent = replNode
        ast.fix_missing_locations(replNode)
        return replNode

# With the introduction of support for scipy-based units and constants, we wrote the 
# implementation of these symbols using a subclass of sympy.Function. Without this 
# wrapper, the constants (floating point valued ones, thereof) will get squashed 
# down to floating point only values when running Python's `eval(compile(...), ...)` call 
# in `evaluate(...)` below. What we wanted to have is to keep the named units and 
# constants symbolic, thus printing their names in output expressions, up until the point 
# where possible postprocessing of user input is done in the question/server files whereby 
# we can access the numerical approximations to these values by an explicit typecase of the 
# sympy expression using `__float__(self)`. On the otherhand, by handling these values 
# internally as though they are function types, the desired behavior can be coaxed up until 
# the point where binary operations with one or more of these operands are of this 
# `class ScipyConstantValue(sympy.Function)` type, and we catch generated exceptions compiling the AST 
# because, for example, it does not know the meaning of multiplying an unevaluated function 
# by an Integer type. Running the next routine to "patch up" the AST expression representations 
# fixes the corner cases that can arise in those 
# use cases when the named units or constants are operands in conventional sympy expressions:
class RedefineScipyOperands(ast.NodeTransformer): 
    def visitBinOpTypeGeneric(self, node, sympyOpType):
        lorchild = tuple([ childNode for childNode in ast.iter_child_nodes(node) ])
        needsFix = True in [ isinstance(child, sympy.FunctionClass) for child in lorchild ]
        if not needsFix:
            return node
        childNodes  = [ child for child in lorchild ]
        newNodeData = eval(sympy.Expr(Lambda(x, sympyOpType(*x))(childNodes)))
        replNode    = ast.parse(newNodeData, mode='eval')
        for child in childNodes:
            child.parent = replNode
        ast.fix_missing_locations(replNode)
        return replNode
    def visit_Add(self, node):
        return self.visitBinOpTypeGeneric(node, sympy.core.add.Add)
    def visit_Sub(self, node):
        subClassFunc =  lambda x, y: sympy.core.add.Add(x, sympy.core.mul.Mul(sympy.Integer(-1), y))
        return self.visitBinOpTypeGeneric(node, subClassFunc)
    def visit_Mult(self, node):
        return self.visitBinOpTypeGeneric(node, sympy.core.mul.Mul)
    def visit_Div(self, node):
        return self.visitBinOpTypeGeneric(node, sympy.Rational)
    def visit_Mod(self, node):
        return self.visitBinOpTypeGeneric(node, sympy.core.Mod)
    def visit_Pow(self, node):
        return self.visitBinOpTypeGeneric(node, sympy.core.Pow)

class CheckWhiteList(ast.NodeVisitor):
    def __init__(self, whitelist):
        self.whitelist = whitelist
    def visit(self, node):
        if True not in list(map(lambda wltype: not isinstance(node, wltype), self.whitelist)):
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
    def __init__(self, variables, var_number_symbols):
        self.variables = variables
        self.var_number_symbols = var_number_symbols 
    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            if not is_name_of_function(node):
                if node.id not in self.variables and node.id not in self.var_number_symbols:
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

def evaluate(expr, locals_for_eval={}, var_number_symbols={}):

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
    CheckVariables(locals_for_eval['variables'], var_number_symbols).visit(root)

    # Disallow AST nodes that are not in whitelist
    #
    # Be very careful about adding to the list below. In particular,
    # do not add `ast.Attribute` without fully understanding the
    # reflection-based attacks described by
    # https://nedbatchelder.com/blog/201206/eval_really_is_dangerous.html
    # http://blog.delroth.net/2013/03/escaping-a-python-sandbox-ndh-2013-quals-writeup/
    whitelist = (ast.Module, ast.Expr, ast.Load, ast.Expression, ast.Call, ast.Name, ast.Num, \
                 ast.UnaryOp, ast.UAdd, ast.USub, ast.BinOp, ast.Add, ast.Sub, ast.Mult, \
                 ast.Div, ast.Mod, ast.Pow)
    CheckWhiteList(whitelist).visit(root)

    # Disallow float and complex, and replace int with sympy equivalent
    root = CheckNumbers().visit(root)

    # Rename dominant metaclasses that are oddly nested within the sympy hierarchy of types 
    # to the most simple expected type:
    #root = CheckScipyTypes().visit(root)

    # Add in symbolic compiler substs for BinOp types with otherwise undefined behavior 
    # on certain scipy library operand types: 
    root = RedefineScipyOperands().visit(root)

    # Clean up lineno and col_offset attributes
    ast.fix_missing_locations(root)

    # Convert AST to code and evaluate it with no global expressions and with
    # a whitelist of local expressions
    locals = {}
    for key in locals_for_eval:
        locals = {**locals, **locals_for_eval[key]}
    locals = {**locals, **var_number_symbols}
    globals = {
        '__builtins__' : {}
    }
    compiledAST = compile(root, '<ast>', 'eval')
    return eval(compiledAST, globals, locals)

def convert_string_to_sympy(a, variables, const=None, allow_hidden=False, allow_complex=False):
    if const is None:
        const = _Constants()
    # Create a whitelist of valid functions and variables (and a special flag
    # for numbers that are converted to sympy integers).
    locals_for_eval = {
        'functions' : const.functions,
        'variables' : const.variables,
        'helpers'   : const.helpers,
    }
    if allow_hidden and not allow_complex:
        locals_for_eval['variables'] = {**locals_for_eval['variables'], **const.hidden_variables}
    elif allow_hidden and allow_complex:
            locals_for_eval['variables'] = {**locals_for_eval['variables'], **const.complex_variables, **const.hidden_complex_variables}
    elif allow_complex:
        locals_for_eval['variables'] = {**locals_for_eval['variables'], **const.complex_variables}
    else:
        locals_for_eval['variables'] = {**locals_for_eval['variables']}

    # If there is a list of variables, add each one to the whitelist
    if variables is not None:
        for variable in variables:
            vname = str(variable)
            if vname in const.functions:
                # The server does not store context of units and physical constants (which are Function types) 
                # locally, only the variable names it encounters, so double check to make sure that `vname` is 
                # indeed a new variable name that we need to handle here (otherwise, skip it):
                continue
            if isinstance(variable, str):
                vfunc = sympy.Function(variable)
                locals_for_eval['variables'][vname] = sympy.Symbol(variable)
            else:
                locals_for_eval['variables'][vname] = variable 
    for vname in const.variables.keys():
        variable = const.variables[vname]
        if isinstance(variable, str):
            vfunc = sympy.Function(variable)
            locals_for_eval['variables'][vname] = sympy.Symbol(variable)
        else:
            locals_for_eval['variables'][vname] = variable 

    # And similarly for the function names:
    funcsWithBodySubsts = dict([])
    if const.functions is not None:
        for func in const.functions:
            funcObj = const.functions[func]
            if isinstance(funcObj, sympy.core.function.UndefinedFunction) or isinstance(funcObj, sympy.FunctionClass):
                funcsWithBodySubsts[func] = funcObj
            funcName = str(func)
            locals_for_eval['functions'][func] = const.functions[func]
    
    # Do the conversion
    return evaluate(a, locals_for_eval, const.variables)

def point_to_error(s, ind, w = MAX_FUNCTION_NAME_LENGTH):
    w_left = ind - max(0, ind-w)
    w_right = min(ind+w, len(s)) - ind
    return s[ind-w_left:ind+w_right] + '\n' + ' '*w_left + '^' + ' '*w_right

def sympy_to_json(a, const=None, allow_complex=True):
    if const is None:
        const = _Constants()
    # Get list of variables in the sympy expression
    variables = [v for v in a.free_symbols]

    # Check that variables do not conflict with reserved names
    reserved = {**const.helpers, **const.variables, **const.hidden_variables, **const.functions}
    if allow_complex:
        reserved = {**reserved, **const.complex_variables, **const.hidden_complex_variables}
    for k in reserved.keys():
        for v in variables:
            if k == v:
                #raise ValueError('sympy expression has a variable with a reserved name: {:s}'.format(k))
                pass

    # Apply substitutions for hidden variables
    a = a.subs([(const.hidden_variables[key], key) for key in const.hidden_variables.keys()])
    if allow_complex:
        a = a.subs([(const.hidden_complex_variables[key], key) for key in const.hidden_complex_variables.keys()])

    return {'_type': 'sympy', '_value': str(a), '_variables': variables}

def json_to_sympy(a, const=None, allow_complex=True):
    if const is None:
        const = _Constants()
    if not '_type' in a:
        raise ValueError('json must have key _type for conversion to sympy')
    if a['_type'] != 'sympy':
        raise ValueError('json must have _type == "sympy" for conversion to sympy')
    if not '_value' in a:
        raise ValueError('json must have key _value for conversion to sympy')
    if not '_variables' in a:
        a['_variables'] = None
    import sys
    try:
        sys.stderr(str(a['_value']))
    except Exception:
        pass
    return convert_string_to_sympy(a['_value'], a['_variables'], const, allow_hidden=True, allow_complex=allow_complex)
