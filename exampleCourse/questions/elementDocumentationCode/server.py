import prairielearn as pl
import sympy

def generate(data):

    # Inputs
    data["correct_answers"]["numericvalue"] = 3.14
    data["correct_answers"]["integervalue"] = 42
    data["correct_answers"]["stringvalue"] = "PrairieLearn"
    
    sympy.var('x y')
    data['correct_answers']['mathexpvalue'] = pl.to_json(x + y + 1)
