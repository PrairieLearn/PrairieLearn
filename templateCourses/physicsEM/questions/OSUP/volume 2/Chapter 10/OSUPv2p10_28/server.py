import random
from collections import defaultdict

import numpy as np

nested_dict = lambda: defaultdict(nested_dict)


def generate(data):
    # Start problem code
    data2 = nested_dict()

    # Sample random numbers
    P_T = random.choice(np.linspace(1710, 1890, num=19))  # W
    P_S = random.choice(np.linspace(1310, 1490, num=19))  # W
    P_L = random.choice(np.linspace(60, 90, num=7))  # W
    I_F = random.choice(np.linspace(20, 30, num=11))  # A
    V = random.choice(np.linspace(120, 150, num=7))  # V

    # Check P_L value for grammatical purposes
    if 80 <= P_L <= 90:
        prep = "an"
    else:
        prep = "a"

    # title
    data2["params"]["vars"]["title"] = "Electrical Appliances Plugged into an Outlet"

    # Put these numbers into data['params']
    data2["params"]["P_T"] = "{:.0f}".format(P_T)
    data2["params"]["P_S"] = "{:.0f}".format(P_S)
    data2["params"]["P_L"] = "{:.1f}".format(P_L)
    data2["params"]["I_F"] = "{:.1f}".format(I_F)
    data2["params"]["V"] = "{:.1f}".format(V)
    data2["params"]["prep"] = prep

    # Compute the solutions
    I_T = float(P_T / V)
    I_S = float(P_S / V)
    I_L = float(P_L / V)

    # Put the solutions into data['correct_answers']
    data2["correct_answers"]["part1_ans"] = I_T
    data2["correct_answers"]["part2_ans"] = I_S
    data2["correct_answers"]["part3_ans"] = I_L

    # define possible answers
    data2["params"]["part4"]["ans1"]["value"] = "Yes"
    data2["params"]["part4"]["ans2"]["value"] = "No"

    # Determine correct answer
    if (I_T + I_S + I_L) >= I_F:
        data2["params"]["part4"]["ans1"]["correct"] = True
        data2["params"]["part4"]["ans1"]["feedback"] = "Great! You got it."
        data2["params"]["part4"]["ans2"]["correct"] = False
        data2["params"]["part4"]["ans2"][
            "feedback"
        ] = "Double check your work. Is the total current drawn less than the current rating of the fuse?"
    else:
        data2["params"]["part4"]["ans1"]["correct"] = False
        data2["params"]["part4"]["ans1"][
            "feedback"
        ] = "Double check your work. Is the total current drawn greater than the current rating of the fuse?"
        data2["params"]["part4"]["ans2"]["correct"] = True
        data2["params"]["part4"]["ans2"]["feedback"] = "Great! You got it."

    # Update the data object with a new dict
    data.update(data2)
