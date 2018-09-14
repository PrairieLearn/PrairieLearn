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
