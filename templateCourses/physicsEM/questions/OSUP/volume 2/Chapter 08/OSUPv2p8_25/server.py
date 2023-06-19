import random

import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = "True"

feedback_dict = {
    "vars": ["part1_ans"],
    "stringData": ["A"],
    "units": ["$~\mathrm{m^2}$"],
}


def generate(data):
    data2 = pbh.create_data2()

    # store phrases etc.

    data2["params"]["vars"]["title"] = "Area of Capacitor Plates"

    # define bounds of the variables
    c = random.choice(np.linspace(1, 5, num=41))  # pF
    d = random.choice(np.linspace(1, 5, num=41))  # mm

    # store the variables in the dictionary "params"
    data2["params"]["c"] = "{:.1f}".format(c)
    data2["params"]["d"] = "{:.1f}".format(d)

    # fix units
    c = c * 1e-12  # F
    d = d * 1e-3  # m

    # define some constants
    eps0 = 8.85e-12

    # calculate the correct
    A = (c * d) / eps0  # m^2

    # define correct answers
    data2["correct_answers"]["part1_ans"] = A

    # Write the solution formatted using scientific notation while keeping 3 sig figs.
    data2["correct_answers"]["part1_ans_str"] = "{:.2e}".format(A)

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
