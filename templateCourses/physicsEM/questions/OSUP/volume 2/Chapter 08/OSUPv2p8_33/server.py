import random

import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = "True"

feedback_dict = {
    "vars": ["part1_ans"],
    "stringData": ["C"],
    "units": ["$~\mu\mathrm{F}$"],
}


def generate(data):
    data2 = pbh.create_data2()

    # store phrases etc.

    data2["params"]["vars"]["title"] = "Equivalent Capacitance"

    # define bounds of the variables
    a = random.choice(np.linspace(5, 15, num=11))  # microF
    b = random.choice(np.linspace(1, 5, num=9))  # microF
    c = random.choice(np.linspace(0.1, 1, num=10))  # microF

    # store the variables in the dictionary "params"
    data2["params"]["a"] = "{:.0f}".format(a)
    data2["params"]["b"] = "{:.1f}".format(b)
    data2["params"]["c"] = "{:.1f}".format(c)

    # calculate the correct
    C = (c * (a + b)) / (a + b + c)  # microF

    # define correct answers
    data2["correct_answers"]["part1_ans"] = C

    # Write the solution formatted using scientific notation while keeping 3 sig figs.
    data2["correct_answers"]["part1_ans_str"] = "{:.2e}".format(C)

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
