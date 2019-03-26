import prairielearn as pl

# Required for symbolic input
import sympy

def generate(data):

    # Fill in the Blank Inputs
    data["correct_answers"]["numericvalue"] = 3.14
    data["correct_answers"]["integervalue"] = 42
    data["correct_answers"]["stringvalue"] = "PrairieLearn"
    
    # Symbolic
    sympy.var('x y')
    data['correct_answers']['mathexpvalue'] = pl.to_json(x + y + 1)
