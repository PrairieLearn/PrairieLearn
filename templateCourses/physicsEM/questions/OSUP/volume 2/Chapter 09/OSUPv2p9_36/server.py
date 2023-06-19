import random

import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = "True"

feedback_dict = {"vars": ["part1_ans"], "stringData": ["V"], "units": ["$~\mathrm{V}$"]}


def generate(data):
    data2 = pbh.create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Voltage Supplied To An Indicator Light"
    data2["params"]["vars"]["units"] = "V"

    # define bounds of the variables
    R = random.randint(50, 300)
    I = random.randint(0, 100)

    # store the variables in the dictionary "params"
    data2["params"]["R"] = R
    data2["params"]["I"] = I

    # calculate the correct
    V = I * 1e-3 * R

    # define correct answers
    data2["correct_answers"]["part1_ans"] = round(V, 2)

    # Update the data object with a new dict
    data.update(data2)


def prepare(data):
    pass


def parse(data):
    # Call a function to check if the submitted answers should be re-expressed using scientific notation.
    for i, k in enumerate(feedback_dict["vars"]):
        data["submitted_answers"][k + "_str"] = pbh.sigFigCheck(
            data["submitted_answers"][k],
            feedback_dict["stringData"][i],
            feedback_dict["units"][i],
        )


def grade(data):
    # Call a function to check for easily-identifiable errors.
    # The syntax is pbh.ErrorCheck(errorCheck, submittedAnswer, correctAnswer, LaTeXsyntax, relativeTolerance)
    # To enable error checking, set errorCheck = 'true'.

    for i, k in enumerate(feedback_dict["vars"]):
        data["feedback"][k] = pbh.ErrorCheck(
            errorCheck,
            data["submitted_answers"][k],
            data["correct_answers"][k],
            feedback_dict["stringData"][i],
            rtol,
        )
