import random

import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = "True"

feedback_dict = {"vars": ["part1_ans"], "stringData": ["I"], "units": ["$~\mathrm{A}$"]}


def generate(data):
    data2 = pbh.create_data2()

    data2["params"]["vars"]["title"] = "Solenoid current"

    # define bounds of the variables
    n = random.choice(np.linspace(8, 20, num=13))  # turns/cm
    B = random.choice(np.linspace(1, 5, num=21))
    p = random.choice(np.linspace(-2, -1, num=2))

    # store the variables in the dictionary "params"
    data2["params"]["n"] = "{:.0f}".format(n)
    data2["params"]["B"] = (
        "{:.1f}".format(B) + "\\times 10^{" + "{:.0f}".format(p) + "}"
    )

    # fix units
    n = n * 100  # turns/m
    B = B * 10**p  # T

    # define some constants
    u0 = 4e-7 * np.pi

    # calculate the solution
    I = B / (u0 * n)

    # define correct answers
    data2["correct_answers"]["part1_ans"] = I

    # Write the solution formatted using scientific notation while keeping 3 sig figs.
    data2["correct_answers"]["part1_ans_str"] = "{:.1f}".format(I)

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
