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
chapter = 6


def generate(data):
    # Pass the rtol value to {{params.rtol}}.
    data["params"]["rtol"] = str(rtol)

    # Sample random numbers
    q = random.choice(np.linspace(1, 20, num=39))
    p = random.choice([-8, -7, -6, -5])
    d = random.choice(np.linspace(6, 9, num=31))
    d1 = random.choice(np.linspace(10, 12, num=21))
    r = random.choice(np.linspace(2, 5, num=31))

    # Put these numbers into data['params']
    data["params"]["q"] = "{:.1f}".format(q)
    data["params"]["p"] = "{:.0f}".format(p)
    data["params"]["d"] = "{:.1f}".format(d)
    data["params"]["d1"] = "{:.1f}".format(d1)
    data["params"]["r"] = "{:.1f}".format(r)

    # Compute the solutions
    e0 = 8.85e-12  # C^2/N m^2
    rho = q * 10**p / (d / 100) ** 3
    Phi1 = q * 10**p / e0
    Phi2 = (rho * 4 * np.pi * (r / 100) ** 3 / 3) / e0

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["rho"] = ext.round_sig(rho, 3)
    data["correct_answers"]["Phi1"] = ext.round_sig(Phi1, 3)
    data["correct_answers"]["Phi2"] = ext.round_sig(Phi2, 3)

    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    data["correct_answers"]["rhostr"] = "{:.2e}".format(rho)
    data["correct_answers"]["Phi1str"] = "{:.2e}".format(Phi1)
    data["correct_answers"]["Phi2str"] = "{:.2e}".format(Phi2)

    # To display an attribution, use ext.attribution(displayAttribution, source, volume, chapter).
    # displatAttribution is a string and should be either 'true' or 'false'.  The source parameter
    # is also a string.  Currently, the allowed values are 'original' (the default) and 'OSUP' for
    # Open Stax University Physics.  The volume and chapter parameters are integers and the default
    # values are zero.
    data["params"]["attribution"] = ext.attribution(
        displayAttribution, source, volume, chapter
    )


# Access the submitted answers
varstr = ["rho", "Phi1", "Phi2"]
stringData = ["\\rho", "\\Phi_1", "\\Phi_2"]
units = [
    "$~\mathrm{C}/\mathrm{m}^3$",
    "$~\mathrm{N}\mathrm{m}^2/\mathrm{C}$",
    "$~\mathrm{N}\mathrm{m}^2/\mathrm{C}$",
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
