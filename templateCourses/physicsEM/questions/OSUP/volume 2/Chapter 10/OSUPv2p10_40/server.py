import random
from collections import defaultdict

import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

nested_dict = lambda: defaultdict(nested_dict)

# Feedback params
rtol = 0.03
errorCheck = "True"
feedback_dict = {
    "vars": ["part1_ans", "part2_ans", "part3_ans"],
    "stringData": ["I_1", "I_2", "I_3"],
    "units": ["$~\mathrm{A}$", "$~\mathrm{A}$", "$~\mathrm{A}$"],
}


def generate(data):
    data2 = pbh.create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Circuit Loop within a Loop"

    # Sample random numbers
    R1 = random.choice(np.linspace(2, 9, num=8))  # Ohm
    R2 = random.choice(np.linspace(2, 9, num=8))  # Ohm
    R3 = random.choice(np.linspace(2, 9, num=8))  # Ohm
    V1 = random.choice(np.linspace(20, 25, num=6))  # V
    V2 = random.choice(np.linspace(8, 15, num=8))  # V

    # store the variables in the dictionary "params"
    data2["params"]["R1"] = "{:.1f}".format(R1)
    data2["params"]["R2"] = "{:.1f}".format(R2)
    data2["params"]["R3"] = "{:.1f}".format(R3)
    data2["params"]["V1"] = "{:.1f}".format(V1)
    data2["params"]["V2"] = "{:.1f}".format(V2)

    # Compute the solutions
    I1 = (R2 * V2 + R3 * V1) / (R1 * R2 + R1 * R3 + R2 * R3)
    I2 = (R1 * V1 - R1 * V2 + R3 * V1) / (R1 * R2 + R1 * R3 + R2 * R3)
    I3 = (R1 * V1 - R1 * V2 - R2 * V2) / (R1 * R2 + R1 * R3 + R2 * R3)

    # Put the solutions into data['correct_answers']
    data2["correct_answers"]["part1_ans"] = I1
    data2["correct_answers"]["part2_ans"] = I2
    data2["correct_answers"]["part3_ans"] = I3

    # Write the formatted solution.
    data2["correct_answers"]["part1_ans_str"] = "{:.2g}".format(I1)
    data2["correct_answers"]["part2_ans_str"] = "{:.2g}".format(I2)
    data2["correct_answers"]["part3_ans_str"] = "{:.2g}".format(I3)

    # Update the data object with a new dict
    data.update(data2)


def prepare(data):
    pass


def parse(data):
    pass


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
