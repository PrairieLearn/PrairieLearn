import random
from collections import defaultdict

import numpy as np

nested_dict = lambda: defaultdict(nested_dict)


def generate(data):
    # Start problem code
    data2 = nested_dict()

    # Sample a random number
    sign1 = random.choice([-1, 1])
    q1 = sign1 * random.choice(np.linspace(10, 80, num=15))
    sign2 = random.choice([-1, 1])
    q2 = sign2 * random.choice(np.linspace(10, 80, num=15))
    sign3 = random.choice([-1, 1])
    q3 = sign3 * random.choice(np.linspace(10, 80, num=15))
    d = random.choice(np.linspace(1, 4, num=4))

    # Put the values into data['params']
    data2["params"]["q1"] = "{:.0f}".format(q1)
    data2["params"]["q2"] = "{:.0f}".format(q2)
    data2["params"]["q3"] = "{:.0f}".format(q3)
    data2["params"]["d"] = "{:.1f}".format(d)

    # Compute the solution
    e0 = 8.85e-12
    k = 1 / (4 * np.pi * e0)
    F = (4 * k * q3 * 1e-6 / d**2) * (q1 - q2) * 1e-6

    # Put the solutions into data['correct_answers']
    if F == 0:
        data2["correct_answers"]["part1_ans"] = F
    else:
        data2["correct_answers"]["part1_ans"] = np.abs(round(F, 3))

    # Define correct answers for multiple choice
    data2["params"]["part2"]["ans1"]["value"] = "towards q1"
    data2["params"]["part2"]["ans2"]["value"] = "towards q2"
    data2["params"]["part2"]["ans3"]["value"] = "the force is zero"

    if F > 0:
        data2["params"]["part2"]["ans1"]["correct"] = True
        data2["params"]["part2"]["ans1"]["feedback"] = "Great! You got it."
        data2["params"]["part2"]["ans2"]["correct"] = False
        data2["params"]["part2"]["ans2"][
            "feedback"
        ] = "Consider q1 and q2. What is the sign of the larger charge? What is the sign of q3? Is q3 attracted to or repelled by the larger charge?"
        data2["params"]["part2"]["ans3"]["correct"] = False
        data2["params"]["part2"]["ans3"][
            "feedback"
        ] = "Do q1 and q2 have the same charge?"

    elif F < 0:
        data2["params"]["part2"]["ans1"]["correct"] = False
        data2["params"]["part2"]["ans1"][
            "feedback"
        ] = "Consider q1 and q2. What is the sign of the larger charge? What is the sign of q3? Is q3 attracted to or repelled by the larger charge?"
        data2["params"]["part2"]["ans2"]["correct"] = True
        data2["params"]["part2"]["ans2"]["feedback"] = "Great! You got it."
        data2["params"]["part2"]["ans3"]["correct"] = False
        data2["params"]["part2"]["ans3"][
            "feedback"
        ] = "Do q1 and q2 have the same charge?"
    else:
        data2["params"]["part2"]["ans1"]["correct"] = False
        data2["params"]["part2"]["ans1"][
            "feedback"
        ] = "If q1 and q2 have the same charge, they must exert equal and opposite forces on q3."
        data2["params"]["part2"]["ans2"]["correct"] = False
        data2["params"]["part2"]["ans2"][
            "feedback"
        ] = "If q1 and q2 have the same charge, they must exert equal and opposite forces on q3."
        data2["params"]["part2"]["ans3"]["correct"] = True
        data2["params"]["part2"]["ans3"]["feedback"] = "Great! You got it."

    data.update(data2)
