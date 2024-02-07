import math


def generate(data):
    data["params"]["k"] = 20
    data["correct_answers"]["D"] = 0.01
    data["correct_answers"]["L"] = 0.3
    data["correct_answers"]["x1"] = 0.03
    data["correct_answers"]["Tb"] = 85
    data["correct_answers"]["T1"] = 55


def parse(data):
    variables = ["D", "L", "x1", "Tb", "T1", "qf"]
    for name in variables:
        var = data["submitted_answers"].get(name, None)
        if var is None:
            data["format_errors"][name] = "Variable {} is not defined".format(name)
        else:
            if name in ["Tb", "T1"]:
                if var > 100:
                    data["format_errors"][name] = (
                        "Temperature {} looks too high.".format(name)
                    )
                elif var < 10:
                    data["format_errors"][name] = (
                        "Temperature {} looks too low.".format(name)
                    )
            elif name in ["D", "L", "x1"]:
                if var > 0.5:
                    data["format_errors"][name] = (
                        "Dimension {} is outside the range of acceptable values for this experiment. Check your units?".format(
                            name
                        )
                    )


def grade(data):
    Ac = math.pi * data["submitted_answers"]["D"] ** 2 / 4
    qf = (
        -data["params"]["k"]
        * Ac
        * (data["submitted_answers"]["T1"] - data["submitted_answers"]["Tb"])
        / data["submitted_answers"]["x1"]
    )

    if math.isclose(data["submitted_answers"]["qf"], qf, rel_tol=1e-03, abs_tol=0.0):
        data["partial_scores"]["qf"] = {"score": 1, "weight": 1}
    else:
        data["partial_scores"]["qf"] = {"score": 0, "weight": 1}

    variables = ["D", "L", "x1", "Tb", "T1", "qf"]
    score = 0
    for name in variables:
        score += data["partial_scores"][name]["score"]
    data["score"] = score / len(variables)
