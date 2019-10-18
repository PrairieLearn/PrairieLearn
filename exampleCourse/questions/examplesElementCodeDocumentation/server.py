import prairielearn as pl

# Required for symbolic input
import sympy

# Required for matrix input
import numpy as np

# Requried for python variable
import pandas as pd

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
    
    # Display python variable contents
    data_dictionary = { 'a': 1, 'b': 2, 'c': 3 }
    data['params']['data_dictionary'] = pl.to_json(data_dictionary)

    # Display a pandas data frame
    d = {'col1': [1, 2], 'col2': [3, 4]}
    df = pd.DataFrame(data=d)
    data['params']['df'] = pl.to_json(df)

    # Display a dynamically generated graph
    mat = np.random.random((3, 3))
    mat = mat / np.linalg.norm(mat, 1, axis=0)
    data['params']['labels'] = pl.to_json(['A', 'B', 'C'])
    data['params']['matrix'] = pl.to_json(mat)
