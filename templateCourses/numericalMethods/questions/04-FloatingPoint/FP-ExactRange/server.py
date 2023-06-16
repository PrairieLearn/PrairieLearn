import random

import prairielearn as pl


def generate(data):
    rand = random.choice([3, 4, 5, 6])

    if random.choice([True, False]):
        exp_range = "$m \\in [-128, 127]$"
    else:
        exp_range = "$m \\in [-256, 255]$"

    s = ""
    for i in range(1, rand + 1):
        s += "b_" + str(i)
    representation = "$(1." + s + ")_2\\times 2^{m}$"

    data["params"]["exp_range"] = exp_range
    data["params"]["representation"] = representation
    data["correct_answers"]["f"] = 2 ** (rand + 1)
    return data


def parse(data):
    name = "f"
    a_sub = data["submitted_answers"].get(name, None)
    if a_sub is not None:
        a_sub = pl.from_json(a_sub)
        if isinstance(a_sub, float):
            data["format_errors"][
                name
            ] = "Your submission was too large to be parsed correctly.  Your answer should <strong>not</strong> be the largest representable floating-point number."


def grade(data):
    if data["score"] != 1.0:
        feedback = "Because the range of $m$ is large enough, we need to consider the number of fractional bits."
    else:
        feedback = ""
    data["feedback"]["question_feedback"] = feedback
