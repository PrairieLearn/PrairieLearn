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
    L = random.choice(np.linspace(10, 13, num=7))
    E = random.choice(np.linspace(2, 6, num=9))
    p1 = random.choice([4, 5, 6])
    v = random.choice(np.linspace(0.8, 2, num=13))
    p2 = 7
    q = 1.6e-19  # C
    m = 1.67e-27  # mass of a proton in kg

    # Put this number into data['params']
    data["params"]["L"] = "{:.1f}".format(L)
    data["params"]["E"] = "{:.1f}".format(E)
    data["params"]["p1"] = "{:.0f}".format(p1)
    data["params"]["v"] = "{:.1f}".format(v)
    data["params"]["p2"] = "{:.0f}".format(p2)

    # Compute the solution
    d = ext.round_sig(
        (q * E * 10**p1 / (2 * m) * (L * 1e-2 / (v * 10**p2)) ** 2) * 1e3, 3
    )  # mm

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["d"] = d

    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    data["correct_answers"]["dstr"] = "{:.2e}".format(d)

    # To display an attribution, use ext.attribution(displayAttribution, source, volume, chapter).
    # displatAttribution is a string and should be either 'true' or 'false'.  The source parameter
    # is also a string.  Currently, the allowed values are 'original' (the default) and 'OSUP' for
    # Open Stax University Physics.  The volume and chapter parameters are integers and the default
    # values are zero.
    data["params"]["attribution"] = ext.attribution(
        displayAttribution, source, volume, chapter
    )


# Access the submitted answers
varstr = ["d"]
stringData = ["d"]
units = ["$~\mathrm{mm}$"]  # Use LaTeX notation $~\mathrm{unit}$


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
