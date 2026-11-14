import prairielearn as pl
import sympy


def generate(data):
    a = sympy.Symbol("a")
    data["correct_answers"]["points"] = pl.to_json(
        sympy.FiniteSet(sympy.Tuple(1, a), sympy.Tuple(a + 1, 2))
    )
