def parse(data):
    variables = ["x", "y", "z", "F"]
    for name in variables:
        var = data["submitted_answers"].get(name, None)
        if var is None:
            data["format_errors"][name] = f"Variable {name} is not defined"
        elif var > 1 or var < 0:
            data["format_errors"][name] = f"Variable {name} has to be either 0 or 1"


def grade(data):
    x = data["submitted_answers"]["x"]
    y = data["submitted_answers"]["y"]
    z = data["submitted_answers"]["z"]
    F_sub = data["submitted_answers"]["F"]

    F_tru = ((not y) and z) or x

    data["correct_answers"]["x"] = x
    data["correct_answers"]["y"] = y
    data["correct_answers"]["z"] = z
    data["correct_answers"]["F"] = F_tru

    if F_tru == F_sub:
        data["score"] = 1
    else:
        data["score"] = 0


def test(data):
    if data["test_type"] == "invalid":
        return

    is_correct = data["test_type"] == "correct"
    data["raw_submitted_answers"] = {
        "x": "1",
        "y": "0",
        "z": "1",
        "F": "1" if is_correct else "0",
    }
    data["score"] = 1 if is_correct else 0
