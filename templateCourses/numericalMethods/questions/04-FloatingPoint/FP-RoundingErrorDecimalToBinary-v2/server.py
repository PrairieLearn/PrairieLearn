import numpy as np


def generate(data):
    n = np.random.randint(3, 5)

    c = 1
    number_str = "(-1)^{s} \\times (1.b_" + str(c)
    for i in range(n):
        c += 1
        number_str += "b_" + str(c)

    number_str += ")_2 \\times 2^m"

    exp_max = np.random.randint(n + 1, 9)
    exp_min = -exp_max + 1

    exp_range = "[" + str(exp_min) + ", " + str(exp_max) + "]"

    round_type = np.random.choice(["up", "down"])
    m = np.random.randint(0, 5)

    places = np.random.choice([0, 1], n)
    places = np.append(places, np.array([0, 1, 1]))

    f = (1 + np.sum(places * 2.0 ** (-np.arange(1, len(places) + 1)))) * 2**m

    if round_type == "up":
        pl_bin = places[:-3].copy()
        pl_bin = np.append(pl_bin, 1)
        f_bin = (1 + np.sum(pl_bin * 2.0 ** (-np.arange(1, len(pl_bin) + 1)))) * 2**m
        round_string = "rounds up (towards infinity)"

    if round_type == "down":
        pl_bin = places[:-3].copy()
        f_bin = (1 + np.sum(pl_bin * 2.0 ** (-np.arange(1, len(pl_bin) + 1)))) * 2**m
        round_string = "rounds down (towards zero)"

    error = np.abs(f_bin - f)

    data["params"]["fp_format"] = number_str
    data["params"]["decimal_f"] = f
    data["params"]["rounding"] = round_string
    data["params"]["exp_range"] = exp_range
    data["correct_answers"]["f"] = error

    return data


def grade(data):
    if data["score"] != 1.0:
        feedback = "The first bit to the left of the binary point is 1 which suggests that the question is asking about normalized floating points. Your next step should be trying to figure out what value of the exponent, $m$, would allow you to construct the most accurate FP representation given the rounding system. For more information please refer to slides 12-16 in the 'Floating Point' section."
    else:
        feedback = ""
    data["feedback"]["question_feedback"] = feedback
