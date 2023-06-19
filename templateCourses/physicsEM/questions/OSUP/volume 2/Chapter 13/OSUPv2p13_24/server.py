import random

import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = "True"

feedback_dict = {
    "vars": ["part1_ans"],
    "stringData": ["\\varepsilon"],
    "units": ["$~\mathrm{V}$"],
}


def generate(data):
    # Start problem code

    data2 = pbh.create_data2()

    # store phrases etc.

    data2["params"]["vars"]["title"] = "Coil in Uniform Magnetic Field"

    # define bounds of the variables
    N = random.choice(np.linspace(20, 70, num=6))  # coils
    d = random.choice(np.linspace(5, 25, num=5))  # cm
    B = random.choice(np.linspace(0.25, 1, num=4))  # T
    t = random.choice(np.linspace(0.1, 1, num=10))  # s

    # store the variables in the dictionary "params"
    data2["params"]["N"] = "{:.0f}".format(N)
    data2["params"]["d"] = "{:.0f}".format(d)
    data2["params"]["B"] = "{:.2f}".format(B)
    data2["params"]["t"] = "{:.1f}".format(t)

    # fix units
    d = d * 1e-2  # m

    # calculate the correct answer
    A = (np.pi * d**2) / 4  # m^2
    E = (N * B * A) / t  # V

    # define correct answers
    data2["correct_answers"]["part1_ans"] = E

    # Write the solution formatted using scientific notation while keeping 2 decimal places.
    data2["correct_answers"]["part1_ans_str"] = "{:.2f}".format(E)

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
