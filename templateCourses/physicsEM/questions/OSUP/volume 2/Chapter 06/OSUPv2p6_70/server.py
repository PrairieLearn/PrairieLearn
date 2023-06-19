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
chapter = 6


def generate(data):
    # Pass the rtol value to {{params.rtol}}.
    data["params"]["rtol"] = str(rtol)

    # Sample a random number
    q = random.choice([-10, -9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    p = random.choice([-12])
    rin = random.choice([2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4])
    dr = random.choice([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
    E = random.choice([4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10])
    rout = rin + dr

    # Put this numbers into data['params']
    data["params"]["q"] = "{:.1f}".format(q)
    data["params"]["p"] = "{:.0f}".format(p)
    data["params"]["rin"] = "{:.1f}".format(rin)
    data["params"]["rout"] = "{:.1f}".format(rout)
    data["params"]["E"] = "{:.1f}".format(E)

    # Compute the solution
    e0 = 8.85e-12
    sigInner = -q * 10**p / (4 * np.pi * (rin / 100) ** 2)
    sigOuter = e0 * E
    Q = sigOuter * 4 * np.pi * (rout / 100) ** 2 - q * 10**p

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["sigInner"] = ext.round_sig(sigInner, 3)
    data["correct_answers"]["sigOuter"] = ext.round_sig(sigOuter, 3)
    data["correct_answers"]["Q"] = ext.round_sig(Q, 3)

    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    data["correct_answers"]["sigInnerstr"] = "{:.2e}".format(sigInner)
    data["correct_answers"]["sigOuterstr"] = "{:.2e}".format(sigOuter)
    data["correct_answers"]["Qstr"] = "{:.2e}".format(Q)

    # To display an attribution, use ext.attribution(displayAttribution, source, volume, chapter).
    # displatAttribution is a string and should be either 'true' or 'false'.  The source parameter
    # is also a string.  Currently, the allowed values are 'original' (the default) and 'OSUP' for
    # Open Stax University Physics.  The volume and chapter parameters are integers and the default
    # values are zero.
    data["params"]["attribution"] = ext.attribution(
        displayAttribution, source, volume, chapter
    )


# Access the submitted answers
varstr = ["sigInner", "sigOuter", "Q"]
stringData = [
    "\\sigma_\mathrm{inner}",
    "\\sigma_\mathrm{outer}",
    "Q",
]  # For some reason a double backslash is needed.
units = [
    "$~\mathrm{N}/\mathrm{m}^2$",
    "$~\mathrm{N}/\mathrm{m}^2$",
    "$~\mathrm{C}$",
]  # Use LaTeX notation $~\mathrm{unit}$


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
