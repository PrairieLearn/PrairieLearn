import random

import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = "True"

feedback_dict = {
    "vars": ["part1_ans"],
    "stringData": ["|Q|/m"],
    "units": ["$~\mathrm{C/kg}$"],
}


def generate(data):
    data2 = pbh.create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Velocity Selector"

    # define bounds of the variables
    B = round(random.uniform(0.01, 1), 3)
    E = round(random.uniform(0.1, 3), 1)
    r = round(random.uniform(1, 3), 2)

    # store the variables in the dictionary "params"
    data2["params"]["B"] = B
    data2["params"]["E"] = E
    data2["params"]["r"] = r

    # defining constants
    q = 1.6e-19

    # calculating correct answer
    v = (E * 1e4) / B
    ratio = v / (B * r * 1e-3)

    # define correct answers
    data2["correct_answers"]["part1_ans"] = ratio

    # Update the data object with a new dict
    data.update(data2)


def prepare(data):
    pass


def parse(data):
    pass


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
