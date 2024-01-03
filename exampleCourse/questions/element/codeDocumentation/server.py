# Required to export values
# Required to generate random numbers
import random

# Required for matrix input
import numpy as np

# Requried for python variable
import pandas as pd
import prairielearn as pl

# Required for symbolic input
import sympy


def generate(data):
    # Generate a random value
    x = random.uniform(1, 2)

    # Fill in the Blank Inputs
    data["correct_answers"]["ans_rtol"] = x
    data["correct_answers"]["ans_sig"] = round(x, 2)
    data["correct_answers"]["int_value"] = 42
    data["correct_answers"]["string_value"] = "Learn"

    # Symbolic
    x, y = sympy.symbols("x y")
    data["correct_answers"]["symbolic_math"] = pl.to_json(x + y + 1)

    # Matrix Fill in the Blank
    data["correct_answers"]["matrixA"] = pl.to_json(np.matrix("1 2; 3 4"))

    # Programming Variant of Supplying a Matrix
    data["correct_answers"]["matrixB"] = pl.to_json(np.matrix("1 2; 3 4"))

    # Output elements
    data["params"]["matrixC"] = pl.to_json(np.matrix("5 6; 7 8"))
    data["params"]["matrixD"] = pl.to_json(np.matrix("-1 4; 3 2"))

    # Display python variable contents
    data_dictionary = {"a": 1, "b": 2, "c": 3}
    data["params"]["data_dictionary"] = pl.to_json(data_dictionary)

    # Display a pandas data frame
    d = {"col1": [1, 2], "col2": [3, 4]}
    df = pd.DataFrame(data=d)
    data["params"]["df"] = pl.to_json(df)

    # Display a dynamically generated graph
    mat = np.random.random((3, 3))
    mat = mat / np.linalg.norm(mat, 1, axis=0)
    data["params"]["labels"] = pl.to_json(["A", "B", "C"])
    data["params"]["matrix"] = pl.to_json(mat)

    # Overlay
    data["correct_answers"]["c"] = (2 * (3**2)) ** 0.5
