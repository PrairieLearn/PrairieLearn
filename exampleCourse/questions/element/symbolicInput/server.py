import sympy
import prairielearn as pl

def generate(data):
    sympy.var('y b a m')
    x = (y - b) / a
    z = m * (sympy.cos(a) + sympy.I * sympy.sin(a))
    c = a + sympy.I * b
    data['correct_answers']['x'] = pl.to_json(x)
    data['correct_answers']['z'] = pl.to_json(z)
    data['correct_answers']['I'] = 'V / R'
    data['correct_answers']['c'] = pl.to_json(c)
    data['correct_answers']['dx'] = 'x'
    x = sympy.var('x')
    data['correct_answers']['simplify'] = pl.to_json(x**2+x+1)
    data['correct_answers']['AxB'] = pl.to_json(set((1, 3), (1, 4), (1, 5), (2, 3), (2, 4), (2, 5)))
