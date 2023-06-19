import random

import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

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
        "part8_ans",
    ],
    "stringData": [
        "I_\mathrm{1s}",
        "P_\mathrm{1s}",
        "I_\mathrm{2s}",
        "P_\mathrm{2s}",
        "I_\mathrm{1p}",
        "P_\mathrm{1p}",
        "I_\mathrm{2p}",
        "P_\mathrm{2p}",
    ],
    "units": [
        "$\rm\ A$",
        "$\rm\ W$",
        "$\rm\ A$",
        "$\rm\ W$",
        "$\rm\ A$",
        "$\rm\ W$",
        "$\rm\ A$",
        "$\rm\ W$",
    ],
}


def generate(data):
    data2 = pbh.create_data2()

    # Sample random numbers
    V = random.choice(np.linspace(45, 60, num=16))  # V
    R1 = random.choice(np.linspace(15, 30, num=16))  # Ohm
    R2 = random.choice(np.linspace(75, 99, num=25))  # Ohm

    # Put these numbers into data['params']
    data2["params"]["V"] = "{:.1f}".format(V)
    data2["params"]["R1"] = "{:.1f}".format(R1)
    data2["params"]["R2"] = "{:.1f}".format(R2)

    # Compute the solutions
    I_S = float(V / (R1 + R2))  # A
    P_S1 = float(R1 * I_S**2)  # W
    P_S2 = float(R2 * I_S**2)  # W
    I_P1 = float(V / R1)  # A
    I_P2 = float(V / R2)  # A
    P_P1 = float(R1 * I_P1**2)  # W
    P_P2 = float(R2 * I_P2**2)  # W

    # Put the solutions into data['correct_answers']
    data2["correct_answers"]["part1_ans"] = I_S
    data2["correct_answers"]["part2_ans"] = P_S1
    data2["correct_answers"]["part3_ans"] = I_S
    data2["correct_answers"]["part4_ans"] = P_S2
    data2["correct_answers"]["part5_ans"] = I_P1
    data2["correct_answers"]["part6_ans"] = P_P1
    data2["correct_answers"]["part7_ans"] = I_P2
    data2["correct_answers"]["part8_ans"] = P_P2

    # Update the data object with a new dict
    data.update(data2)


def prepare(data):
    pass


def parse(data):
    pass


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
