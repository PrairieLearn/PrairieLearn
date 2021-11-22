import prairielearn as pl
import sympy

def generate(data):
    # Original test cases:
    y, b, a, m = sympy.var('y b a m')
    x = (y - b) / a
    z = m * (sympy.cos(a) + sympy.I * sympy.sin(a))
    c = a + sympy.I * b
    data['correct_answers']['x'] = pl.to_json(x)
    data['correct_answers']['z'] = pl.to_json(z)
    data['correct_answers']['I'] = 'V / R'
    data['correct_answers']['c'] = pl.to_json(c)
    data['correct_answers']['dx'] = 'x'
    # Test cases added to ensure correctness of the new pl-symbolic-input functionality:
    symMathExample1 = 'x + y + 1'
    symMathExample2 = 'log32(x^2) * zeta(5) + y'
    symMathExample3 = 'ln((max(1-t, x) + min(y+2, z) - lg(w^2)) / 2)'
    symMathExample4 = 'x * mod(cbrt_omega) / 137 + 1 - t^(3 / 2)'
    symMathExample5 = '1 / 2 / sqrt2 * ((1 + sqrt2)**n + (1 - sqrt2)**n) / mibi + speed_of_light'
    prepareSymbolicAnswerFunc = lambda expr: pl.to_json(sympy.sympify(expr))
    x = sympy.var('x')
    data['correct_answers']['simplify_example'] = prepareSymbolicAnswerFunc('x^2+x+1')
    data['correct_answers']['symbolic_math_example1'] = prepareSymbolicAnswerFunc(symMathExample1)
    data['correct_answers']['symbolic_math_example2'] = prepareSymbolicAnswerFunc(symMathExample2)
    data['correct_answers']['symbolic_math_example3'] = prepareSymbolicAnswerFunc(symMathExample3)
    data['correct_answers']['symbolic_math_example4'] = prepareSymbolicAnswerFunc(symMathExample4)
    data['correct_answers']['symbolic_math_example5'] = prepareSymbolicAnswerFunc(symMathExample5)
