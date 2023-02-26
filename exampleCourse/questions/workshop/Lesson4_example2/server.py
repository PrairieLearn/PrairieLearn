def parse(data):
    variables = ["x", "y", "z", "F"]
    for name in variables:
        var = data["submitted_answers"].get(name, None)
        if var is None:
            data["format_errors"][name] = "Variable {} is not defined".format(name)
        elif var > 1 or var < 0:
            data["format_errors"][name] = "Variable {} has to be either 0 or 1".format(
                name
            )


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
