import lxml.html
from html import escape
import chevron
import prairielearn as pl
import sympy
import random
import ast

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers_name"]
    optional_attribs = ["weight", "correct_answer", "variables"]
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers_name")

    correct_answer = pl.get_string_attrib(element, "correct_answer", None)
    if correct_answer is not None:
        if name in data["correct_answers"]:
            raise Exception("duplicate correct_answers variable name: %s" % name)
        data["correct_answers"][name] = correct_answer

    return data

def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers_name")
    variables = pl.get_string_attrib(element, "variables", None)

    if data["panel"] == "question":
        editable = data["editable"]
        raw_submitted_answer = data["raw_submitted_answers"].get(name, None)

        operators = ', '.join(['cos','sin','tan','exp','log','sqrt','( )','+','-','*','/','^','**'])
        constants = ', '.join(['pi'])

        info_params = {"format": True, "variables": variables, "operators": operators, "constants": constants}
        with open('pl_symbolic_input.mustache','r') as f:
            info = chevron.render(f,info_params).strip()
        with open('pl_symbolic_input.mustache','r') as f:
            info_params.pop("format",None)
            info_params["shortformat"] = True
            shortinfo = chevron.render(f,info_params).strip()

        html_params = {'question': True, 'name': name, 'editable': editable, 'info': info, 'shortinfo': shortinfo}
        if raw_submitted_answer is not None:
            html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl_symbolic_input.mustache','r') as f:
            html = chevron.render(f,html_params).strip()

    elif data["panel"] == "submission":
        parse_error = data["format_errors"].get(name, None)
        html_params = {'submission': True, 'parse_error': parse_error}
        if parse_error is None:
            a_sub = data["submitted_answers"][name]
            a_sub = convert_string_to_sympy(a_sub, variables)
            html_params["a_sub"] = sympy.latex(a_sub)
        else:
            raw_submitted_answer = data["raw_submitted_answers"].get(name, None)
            if raw_submitted_answer is not None:
                html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl_symbolic_input.mustache','r') as f:
            html = chevron.render(f,html_params).strip()

    elif data["panel"] == "answer":
        a_tru = data["correct_answers"].get(name, None)
        if a_tru is not None:
            a_tru = convert_string_to_sympy(a_tru, variables)
            html_params = {'answer': True, 'a_tru': sympy.latex(a_tru)}
            with open('pl_symbolic_input.mustache','r') as f:
                html = chevron.render(f,html_params).strip()
        else:
            html = ""

    else:
        raise Exception("Invalid panel type: %s" % data["panel"])

    return html

def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers_name")
    variables = pl.get_string_attrib(element, "variables", None)

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data["submitted_answers"].get(name,None)
    if not a_sub:
        data["format_errors"][name] = 'No submitted answer.'
        data["submitted_answers"][name] = None
        return data

    try:
        # Convert submitted answer safely to sympy
        a_sub = convert_string_to_sympy(a_sub, variables)

        # Store result as a string.
        data["submitted_answers"][name] = str(a_sub)
    except:
        data["format_errors"][name] = "Invalid format."
        data["submitted_answers"][name] = None
        return data

    return data

def grade(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers_name")

    # Get weight
    weight = pl.get_integer_attrib(element, "weight", 1)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = data["correct_answers"].get(name,None)
    if a_tru is None:
        return data

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data["submitted_answers"].get(name,None)
    if a_sub is None:
        data["partial_scores"][name] = {"score": 0, "weight": weight}
        return data

    # Parse both correct and submitted answer (will throw an error on fail).
    variables = pl.get_string_attrib(element, "variables", None)
    a_tru = convert_string_to_sympy(a_tru, variables)
    a_sub = convert_string_to_sympy(a_sub, variables)

    # Check equality
    correct = a_tru.equals(a_sub)

    if correct:
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    else:
        data["partial_scores"][name] = {"score": 0, "weight": weight}

    return data

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
# `sympify(...,safe=True)`.
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

class Visitor(ast.NodeVisitor):
    def visit(self, node):
        if not isinstance(node, self.whitelist):
            raise ValueError(node)
        return super().visit(node)

    # Be very careful about adding to the list below. In particular,
    # do not add `ast.Attribute` without fulling understanding the
    # reflection-based attacks described by
    # https://nedbatchelder.com/blog/201206/eval_really_is_dangerous.html
    # http://blog.delroth.net/2013/03/escaping-a-python-sandbox-ndh-2013-quals-writeup/
    whitelist = (ast.Module, ast.Expr, ast.Load, ast.Expression, ast.Call, ast.Name, ast.Num, ast.UnaryOp, ast.UAdd, ast.USub, ast.BinOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow)

def evaluate(expr, locals = {}):
    if any(elem in expr for elem in '\n#'):
        raise ValueError(expr)
    try:
        node = ast.parse(expr.strip(), mode='eval')
        Visitor().visit(node)
        return eval(compile(node, '<ast>', 'eval'), {'__builtins__': None}, locals)
    except Exception:
        raise ValueError(expr)

def convert_string_to_sympy(a,variables):
    # Replace '^' with '**' wherever it appears. In MATLAB, either can be used
    # for exponentiation. In python, only the latter can be used.
    a = a.replace('^','**')

    # Define a list of valid expressions and their mapping to sympy
    locals_for_eval = {'cos': sympy.cos, 'sin': sympy.sin, 'tan': sympy.tan, 'exp': sympy.exp, 'log': sympy.log, 'sqrt': sympy.sqrt, 'pi': sympy.pi}

    # If there is a list of variables, add each one to the list of expressions
    if variables is not None:
        for variable in variables:
            locals_for_eval[variable] = sympy.Symbol(variable)

    # Do the conversion
    a = evaluate(a, locals_for_eval)

    # Run sympify on the result - we can do this safely now. Note that we need
    # to run sympify because we want the result to be a sympy object - if 'a'
    # is an integer, for example, it needs to be converted to sympy.
    return sympy.sympify(a)

def test(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers_name")
    weight = pl.get_integer_attrib(element, "weight", 1)

    result = random.choices(['correct', 'incorrect', 'invalid'], [5, 5, 1])[0]
    if result == 'correct':
        data["raw_submitted_answers"][name] = data["correct_answers"][name]
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    elif result == 'incorrect':
        data["raw_submitted_answers"][name] = data["correct_answers"][name]+' + {:d}'.format(random.randint(1,100))
        data["partial_scores"][name] = {"score": 0, "weight": weight}
    elif result == 'invalid':
        if random.choice([True,False]):
            data["raw_submitted_answers"][name] = 'complete garbage'
            data["format_errors"][name] = "Invalid format."

        # FIXME: add more invalid choices
    else:
        raise Exception('invalid result: %s' % result)

    return data
