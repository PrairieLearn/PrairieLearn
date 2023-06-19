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
    V = random.choice(np.linspace(1, 6, num=51))
    p = random.choice(np.linspace(3, 6, num=4))
    d = random.choice(np.linspace(0.5, 3, num=26))

    # Put these numbers into data['params']
    data["params"]["V"] = "{:.2f}".format(V)
    data["params"]["p"] = "{:.0f}".format(p)
    data["params"]["d"] = "{:.2f}".format(d)

    # Compute the solution
    V = V * 10**p  # V
    d = d / 100  # m
    E = V / d  # N/C

    # Put the solution into data['correct_answers']
    data["correct_answers"]["E"] = ext.round_sig(E, 3)

    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    data["correct_answers"]["Estr"] = "{:.2e}".format(E)

    # To display an attribution, use ext.attribution(displayAttribution, source, volume, chapter).
    # displatAttribution is a string and should be either 'true' or 'false'.  The source parameter
    # is also a string.  Currently, the allowed values are 'original' (the default) and 'OSUP' for
    # Open Stax University Physics.  The volume and chapter parameters are integers and the default
    # values are zero.
    data["params"]["attribution"] = ext.attribution(
        displayAttribution, source, volume, chapter
    )


# Access the submitted answers
varstr = ["E"]
stringData = ["E"]
units = ["$\\rm\ N/C$"]  # Use LaTeX notation


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
