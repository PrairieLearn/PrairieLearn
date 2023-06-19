import random
from collections import defaultdict

import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

nested_dict = lambda: defaultdict(nested_dict)

# Feedback params
rtol = 0.03
errorCheck = "True"

feedback_dict = {"vars": ["part1_ans"], "stringData": ["I"], "units": ["$~\mathrm{A}$"]}


def generate(data):
    data2 = nested_dict()

    data2["params"]["vars"]["title"] = "Long thin wire"

    # define bounds of the variables
    B = random.choice(np.linspace(1, 9, num=41))  # uT
    d = random.choice(np.linspace(10, 80, num=36))  # cm

    # store the variables in the dictionary "params"
    data2["params"]["B"] = "{:.1f}".format(B)
    data2["params"]["d"] = "{:.0f}".format(d)

    # fix units
    B = B * 1e-6  # T
    d = d / 100  # m

    # define some constants
    u0 = 4e-7 * np.pi

    # calculate the correct
    I = B * 2 * np.pi * d / u0

    # define correct answers
    data2["correct_answers"]["part1_ans"] = I

    # Write the solution formatted using scientific notation while keeping 3 sig figs.
    data2["correct_answers"]["part1_ans_str"] = "{:.2f}".format(I)

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
