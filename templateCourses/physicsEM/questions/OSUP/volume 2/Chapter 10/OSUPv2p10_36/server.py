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
    "vars": [
        "part1_ans",
        "part2_ans",
        "part3_ans",
        "part4_ans",
        "part5_ans",
        "part6_ans",
        "part7_ans",
    ],
    "stringData": [
        "V_{R_1}",
        "V_{R_2}",
        "V_{R_3}",
        "V_{R_4}",
        "V_{R_5}",
        "P_{~\\rm in}",
        "P_{~\\rm out}",
    ],
    "units": [
        "$~\mathrm{V}$",
        "$~\mathrm{V}$",
        "$~\mathrm{V}$",
        "$~\mathrm{V}$",
        "$~\mathrm{V}$",
        "$~\mathrm{W}$",
        "$~\mathrm{W}$",
    ],
}


def generate(data):
    data2 = pbh.create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Circuit with Multiple Voltage Sources"

    # Sample random numbers
    R1 = random.choice(np.linspace(10, 15, num=6))  # kilo Ohm
    R2 = random.choice(np.linspace(20, 25, num=6))  # kilo Ohm
    R3 = random.choice(np.linspace(10, 15, num=6))  # kilo Ohm
    R4 = random.choice(np.linspace(10, 20, num=11))  # kilo Ohm
    R5 = random.choice(np.linspace(10, 20, num=11))  # kilo Ohm
    V1 = random.choice(np.linspace(10, 15, num=11))  # V
    V2 = random.choice(np.linspace(20, 25, num=11))  # V

    # store the variables in the dictionary "params"
    data2["params"]["R1"] = "{:.1f}".format(R1)
    data2["params"]["R2"] = "{:.1f}".format(R2)
    data2["params"]["R3"] = "{:.1f}".format(R3)
    data2["params"]["R4"] = "{:.1f}".format(R4)
    data2["params"]["R5"] = "{:.1f}".format(R5)
    data2["params"]["V1"] = "{:.1f}".format(V1)
    data2["params"]["V2"] = "{:.1f}".format(V2)

    # Fix units
    R1 = R1 * 10**3  # Ohm
    R2 = R2 * 10**3  # Ohm
    R3 = R3 * 10**3  # Ohm
    R4 = R4 * 10**3  # Ohm
    R5 = R5 * 10**3  # Ohm

    # Compute the solutions
    R_eff = R1 + R2 + R3 + R4 + R5
    V_eff = V2 - V1
    I = V_eff / R_eff
    VR1 = I * R1
    VR2 = I * R2
    VR3 = I * R3
    VR4 = I * R4
    VR5 = I * R5
    P = I * V_eff

    # Put the solutions into data['correct_answers']
    data2["correct_answers"]["part1_ans"] = VR1
    data2["correct_answers"]["part2_ans"] = VR2
    data2["correct_answers"]["part3_ans"] = VR3
    data2["correct_answers"]["part4_ans"] = VR4
    data2["correct_answers"]["part5_ans"] = VR5
    data2["correct_answers"]["part6_ans"] = P
    data2["correct_answers"]["part7_ans"] = P

    # Write the formatted solution.
    data2["correct_answers"]["part1_ans_str"] = "{:.3g}".format(VR1)
    data2["correct_answers"]["part2_ans_str"] = "{:.3g}".format(VR2)
    data2["correct_answers"]["part3_ans_str"] = "{:.3g}".format(VR3)
    data2["correct_answers"]["part4_ans_str"] = "{:.3g}".format(VR4)
    data2["correct_answers"]["part5_ans_str"] = "{:.3g}".format(VR5)
    data2["correct_answers"]["part6_ans_str"] = "{:.3g}".format(P)
    data2["correct_answers"]["part7_ans_str"] = "{:.3g}".format(P)

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
