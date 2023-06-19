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
chapter = 5


def generate(data):
    # Pass the rtol value to {{params.rtol}}.
    data["params"]["rtol"] = str(rtol)

    # Sample a random number
    sign1 = random.choice([-1, 1])
    q1 = sign1 * random.choice(np.linspace(1.5, 5.5, num=5))
    sign2 = random.choice([-1, 1])
    q2 = sign2 * random.choice(np.linspace(1, 5, num=5))

    # Put this number into data['params']
    data["params"]["q1"] = "{:.1f}".format(q1)
    data["params"]["q2"] = "{:.1f}".format(q2)

    # Compute the solution
    x1 = 1  # m

    if sign1 == sign2:  # The charges are the same sign
        x2 = -np.sqrt(q2 / q1) * x1
    else:  # The charges are opposite sign
        x2 = np.sqrt(-q2 / q1) * x1

    # Put the solution into data['correct_answers']
    data["correct_answers"]["x2"] = ext.round_sig(x2, 3)

    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    data["correct_answers"]["x2str"] = "{:.2e}".format(x2)

    # To display an attribution, use ext.attribution(displayAttribution, source, volume, chapter).
    # displatAttribution is a string and should be either 'true' or 'false'.  The source parameter
    # is also a string.  Currently, the allowed values are 'original' (the default) and 'OSUP' for
    # Open Stax University Physics.  The volume and chapter parameters are integers and the default
    # values are zero.
    data["params"]["attribution"] = ext.attribution(
        displayAttribution, source, volume, chapter
    )


# Access the submitted answers
varstr = ["x2"]
stringData = ["x_2"]
units = ["$~\mathrm{m}$"]  # Use LaTeX notation $~\mathrm{unit}$


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
