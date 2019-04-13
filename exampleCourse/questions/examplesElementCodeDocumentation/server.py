import prairielearn as pl

# Required for symbolic input
import sympy

# Required for matrix input
import numpy as np

def generate(data):

    # Fill in the Blank Inputs
    data["correct_answers"]["numericvalue"] = 3.14
    data["correct_answers"]["integervalue"] = 42
    data["correct_answers"]["stringvalue"] = "PrairieLearn"
    
    # Symbolic
    sympy.var('x y')
    data['correct_answers']['mathexpvalue'] = pl.to_json(x + y + 1)

    # Matrix Fill in the Blank
    data['correct_answers']['matrixA'] = pl.to_json(np.matrix('1 2; 3 4'))
    
    # Programming Variant of Supplying a Matrix
    data['correct_answers']['matrixB'] = pl.to_json(np.matrix('1 2; 3 4'))
    
    # Threejs
    data['correct_answers']['robotC'] = [[1, 0, 0], [0, 45, 0]]
    
    # Output elements
    data['params']['matrixC'] = pl.to_json(np.matrix('5 6; 7 8'))
    data['params']['matrixD'] = pl.to_json(np.matrix('-1 4; 3 2'))


    
