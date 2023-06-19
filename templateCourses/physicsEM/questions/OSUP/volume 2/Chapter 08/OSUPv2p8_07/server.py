import random

import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = "True"

feedback_dict = {
    "vars": ["part1_ans", "part2_ans"],
    "stringData": ["C_1", "C_2"],
    "units": ["$~\mu\mathrm{F}$", "$~\mu\mathrm{F}$"],
}


def generate(data):
    data2 = pbh.create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Combining Capacitors"

    # define bounds of the variables
    c = random.choice(np.linspace(1, 3, num=21))  # muF
    n = random.choice(np.linspace(3, 7, num=5))  # number of capacitors

    # store the variables in the dictionary "params"
    data2["params"]["c"] = "{:.1f}".format(c)

    if n == 3:
        data2["params"]["n"] = "three"
    elif n == 4:
        data2["params"]["n"] = "four"
    elif n == 5:
        data2["params"]["n"] = "five"
    elif n == 6:
        data2["params"]["n"] = "six"
    elif n == 7:
        data2["params"]["n"] = "seven"

    # calculate correct answer for part 1
    A = n * c

    # define correct answer for part 1
    data2["correct_answers"]["part1_ans"] = A

    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    # data2['correct_answers']['part1_ans_str'] = pbh.roundp(A, sigfigs=3, format = 'sci')

    # calculate correct answer for part 2
    B = c / n

    # define correct answer for part 2
    data2["correct_answers"]["part2_ans"] = B

    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    # data2['correct_answers']['part2_ans_str'] = pbh.roundp(B, sigfigs=3, format = 'sci')

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
    # To enable error checking, set check = 'true'.

    for i, k in enumerate(feedback_dict["vars"]):
        data["feedback"][k] = pbh.ErrorCheck(
            errorCheck,
            data["submitted_answers"][k],
            data["correct_answers"][k],
            feedback_dict["stringData"][i],
            rtol,
        )
