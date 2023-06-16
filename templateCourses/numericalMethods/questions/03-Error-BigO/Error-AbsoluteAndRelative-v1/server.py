import random

import numpy as np


def generate(data):

    prompt_type_rand = random.randint(0, 1)

    prompt_type = "relative error" if prompt_type_rand else "absolute error"
    prompt_type = "$\\textbf{" + prompt_type + "}$"
    prompt = None

    water_vol = random.randint(1, 4) * 1000
    cup_vol = random.randint(4, 6) * 100 + random.randint(1, 8) * 10
    cups_num = np.floor(water_vol / cup_vol)

    prompt = (
        "Your friend decided to make you Kool-Aid. "
        + "The instructions called for %d mL of water per packet of mixture. "
        + "Your friend had only an unmarked cup that fits %d ml of water. "
        + "Since she did not want to risk diluting your drink, "
        + "she used exactly %d of these cups of water.\n"
        + "What is the %s associated with using "
        + "only %d cup(s) of water?"
    )

    prompt = prompt % (water_vol, cup_vol, cups_num, prompt_type, cups_num)
    abs_error = abs(water_vol - cup_vol * cups_num)
    rel_error = abs(abs_error) / water_vol

    data["params"]["prompt"] = prompt
    data["correct_answers"]["ans"] = rel_error if prompt_type_rand else abs_error

    return data


def grade(data):
    if data["score"] != 1.0:
        if "relative error" in data["params"]["prompt"]:
            feedback = "Relative error: |water_required - water_used|/|water_required|"
        elif "absolute error" in data["params"]["prompt"]:
            feedback = "Absolute error: |water_required - water_used|"
    else:
        feedback = ""

    data["feedback"]["question_feedback"] = feedback
