import sympy
import ast

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

class ReplaceNumbers(ast.NodeTransformer):
    def visit_Num(self, node):
        if isinstance(node.n, int):
            return ast.Call(func=ast.Name(id='_Integer', ctx=ast.Load()), args=[node], keywords=[])
        elif isinstance(node.n, float):
            return ast.Call(func=ast.Name(id='_Float', ctx=ast.Load()), args=[node], keywords=[])
        return node

class CheckWhiteList(ast.NodeVisitor):
    def visit(self, node):
        if not isinstance(node, self.whitelist):
            raise ValueError(node)
        return super().visit(node)

    # Be very careful about adding to the list below. In particular,
    # do not add `ast.Attribute` without fully understanding the
    # reflection-based attacks described by
    # https://nedbatchelder.com/blog/201206/eval_really_is_dangerous.html
    # http://blog.delroth.net/2013/03/escaping-a-python-sandbox-ndh-2013-quals-writeup/
    whitelist = (ast.Module, ast.Expr, ast.Load, ast.Expression, ast.Call, ast.Name, ast.Num, ast.UnaryOp, ast.UAdd, ast.USub, ast.BinOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow)

def evaluate(expr, locals={}):
    if any(elem in expr for elem in '\n#'):
        raise ValueError(expr)
    try:
        # Convert string to AST
        node = ast.parse(expr.strip(), mode='eval')
        # Check that all AST expressions are on a whitelist
        CheckWhiteList().visit(node)
        # Replace all int and float (not complex) numbers with sympy equivalents
        node = ReplaceNumbers().visit(node)
        # Clean up lineno and col_offset attributes
        ast.fix_missing_locations(node)
        # Convert AST to code and evaluate it with no global expressions and with
        # a whitelist of local expressions
        return eval(compile(node, '<ast>', 'eval'), {'__builtins__': None}, locals)
    except Exception:
        raise ValueError(expr)

def convert_string_to_sympy(a, variables):
    # Define a list of valid expressions and their mapping to sympy
    #
    # If we wanted to allow floating-point numbers in symbolic expressions, we
    # would add this to locals_for_eval:
    #
    #   '_Float': sympy.Float
    #
    # We don't want to allow floating-point numbers, though. They make checking
    # for equality problematic. For example:
    #
    #   (2*pi)**(0.5)
    #
    # is parsed as
    #
    #   1.4142135623731*pi**0.5
    #
    # and is not considered the same as
    #
    #   sqrt(2*pi)
    #
    # If a floating-point number is present, evaluate will throw an exception.
    locals_for_eval = {'cos': sympy.cos, 'sin': sympy.sin, 'tan': sympy.tan, 'exp': sympy.exp, 'log': sympy.log, 'sqrt': sympy.sqrt, 'pi': sympy.pi, '_Integer': sympy.Integer}

    # If there is a list of variables, add each one to the list of expressions
    if variables is not None:
        for variable in variables:
            locals_for_eval[variable] = sympy.Symbol(variable)

    # Do the conversion
    return evaluate(a, locals_for_eval)
