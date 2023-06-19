import copy
import math
import random

import ext
import numpy as np

# Tolerance for pl-number-input
rtol = 0.03

# For error checking...
errorCheck = "true"

# For the attribution...
displayAttribution = "true"
source = "OSUP"
volume = 2
chapter = 7


def generate(data):
    # Pass the rtol value to {{params.rtol}}.
    data["params"]["rtol"] = str(rtol)

    # Sample random numbers
    point = random.choice(["$P_1$", "$P_2$", "$P_3$", "$P_4$"])

    # Put these numbers into data['params']
    data["params"]["point"] = point

    # Compute the solution
    q1 = 5e-3  # C
    q2 = -10e-3  # C
    if point == "$P_1$":
        d1 = 0.02  # m
        d2 = 0.06  # m
    elif point == "$P_2$":
        d1 = 0.06  # m
        d2 = 0.02  # m
    else:
        d1 = np.sqrt(0.04**2 + 0.03**2)  # m
        d2 = d1

    e0 = 8.85e-12
    V = q1 / (4 * np.pi * e0 * d1) + q2 / (4 * np.pi * e0 * d2)

    # Put the solution into data['correct_answers']
    data["correct_answers"]["V"] = ext.round_sig(V, 3)

    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    data["correct_answers"]["Vstr"] = "{:.2e}".format(V)

    # To display an attribution, use ext.attribution(displayAttribution, source, volume, chapter).
    # displatAttribution is a string and should be either 'true' or 'false'.  The source parameter
    # is also a string.  Currently, the allowed values are 'original' (the default) and 'OSUP' for
    # Open Stax University Physics.  The volume and chapter parameters are integers and the default
    # values are zero.
    data["params"]["attribution"] = ext.attribution(
        displayAttribution, source, volume, chapter
    )


# Access the submitted answers
varstr = ["V"]
stringData = ["V"]
units = ["$\\rm\ V$"]  # Use LaTeX notation


def parse(data):
    # Call a function to check if the submitted answers should be re-expressed using scientific notation.
    cnt = 0
    for k in varstr:
        data["submitted_answers"][k + "str"] = ext.sigFigCheck(
            data["submitted_answers"][k], stringData[cnt], units[cnt]
        )
        cnt += 1


# Provide hints.
def grade(data):
    # Call a function to check for easily-identifiable errors.
    # The syntax is ext.ErrorCheck(errorCheck, submittedAnswer, correctAnswer, LaTeXsyntax, relativeTolerance)
    # To enable error checking, set check = 'true'.
    cnt = 0
    for k in varstr:
        data["feedback"][k] = ext.ErrorCheck(
            errorCheck,
            data["submitted_answers"][k],
            data["correct_answers"][k],
            stringData[cnt],
            rtol,
        )
        cnt += 1
