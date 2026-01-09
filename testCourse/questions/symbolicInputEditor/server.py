import prairielearn as pl
import sympy


def generate(data):
    (y, b, a, m) = sympy.symbols("y b a m")
    x = (y - b) / a
    z = m * (sympy.cos(a) + sympy.I * sympy.sin(a))
    c = a + sympy.I * b
    data["correct_answers"]["x"] = pl.to_json(x)
    data["correct_answers"]["z"] = pl.to_json(z)
    data["correct_answers"]["I"] = "V / R"
    data["correct_answers"]["c"] = pl.to_json(c)
    data["correct_answers"]["dx"] = "x"
    x = sympy.var("x")
    data["correct_answers"]["lnx"] = pl.to_json(sympy.log(x) + 1)

    # Sympy automatically simplifies expressions, irrespective of the element attributes.
    # To prevent this, correct answers must be provided as a string.
    data["correct_answers"]["nosimplify"] = "sin(atan(x))"

    data["correct_answers"]["simplify"] = pl.to_json(x**2 + x + 1)

    b = sympy.symbols("B", positive=True)
    data["correct_answers"]["assumptions"] = pl.to_json(sympy.sqrt(b**2))

    c = sympy.symbols("C", nonpositive=True)
    data["correct_answers"]["assumptions_2"] = pl.to_json(sympy.Abs(c))

    the = sympy.Function("the")
    beef = sympy.Function("beef")

    ans = the(y) + beef(y)
    data["correct_answers"]["custom_function_2"] = pl.to_json(ans)

    # Nested absolute value expression: |x+|-x+1+2+3+4||
    inner_expr = -x + 1 + 2 + 3 + 4
    outer_expr = x + sympy.Abs(inner_expr)
    nested_abs_expr = sympy.Abs(outer_expr)
    data["correct_answers"]["nested_abs"] = pl.to_json(nested_abs_expr)
