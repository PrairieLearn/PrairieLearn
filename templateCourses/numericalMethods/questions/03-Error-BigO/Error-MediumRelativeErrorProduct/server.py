import random


def generate(data):
    I_err = random.choice([4, 5, 6])
    R_err = random.choice([2, 3])

    data["params"]["I_err"] = I_err
    data["params"]["R_err"] = R_err

    data["params"]["correct"] = I_err + R_err
    data["params"]["wrong1"] = I_err
    data["params"]["wrong2"] = R_err
    data["params"]["wrong3"] = I_err * R_err

    return data


def grade(data):
    if data["score"] != 1.0:
        feedback = "To compute the relative error, we need the approximate and the true value. The approximate value is readily given in the problem. The true value is not directly given but can be derived using the relative errors for each of the inputs I and R. From here, we can compute the relative error of $V=IR$."
    else:
        feedback = ""

    data["feedback"]["question_feedback"] = feedback
