import prairielearn as pl
import sympy


def generate(data):
    (y, b, a, m) = sympy.var("y b a m")
    x = (y - b) / a
    z = m * (sympy.cos(a) + sympy.I * sympy.sin(a))
    c = a + sympy.I * b
    data["correct_answers"]["x"] = pl.to_json(x)
    data["correct_answers"]["z"] = pl.to_json(z)
    data["correct_answers"]["I"] = "V / R"
    data["correct_answers"]["c"] = pl.to_json(c)
    data["correct_answers"]["dx"] = "x"
    x = sympy.var("x")
    data["correct_answers"]["simplify"] = pl.to_json(x**2 + x + 1)

    B = sympy.symbols('B', positive = True)
    data["correct_answers"]["assumptions"] = pl.to_json(sympy.sqrt(B ** 2))
