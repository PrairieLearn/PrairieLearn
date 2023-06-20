import random

import numpy as np


def generate(data):

    # Sample random numbers
    V = random.choice(np.linspace(45, 60, num=16))  # V
    R1 = random.choice(np.linspace(15, 30, num=16))  # Ohm
    R2 = random.choice(np.linspace(75, 99, num=25))  # Ohm

    # Put these numbers into data['params']
    data["params"]["V"] = "{:.1f}".format(V)
    data["params"]["R1"] = "{:.1f}".format(R1)
    data["params"]["R2"] = "{:.1f}".format(R2)

    # Compute the solutions
    I_S = float(V / (R1 + R2))  # A
    P_S1 = float(R1 * I_S**2)  # W
    P_S2 = float(R2 * I_S**2)  # W
    I_P1 = float(V / R1)  # A
    I_P2 = float(V / R2)  # A
    P_P1 = float(R1 * I_P1**2)  # W
    P_P2 = float(R2 * I_P2**2)  # W

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["part1_ans"] = I_S
    data["correct_answers"]["part2_ans"] = P_S1
    data["correct_answers"]["part3_ans"] = I_S
    data["correct_answers"]["part4_ans"] = P_S2
    data["correct_answers"]["part5_ans"] = I_P1
    data["correct_answers"]["part6_ans"] = P_P1
    data["correct_answers"]["part7_ans"] = I_P2
    data["correct_answers"]["part8_ans"] = P_P2
