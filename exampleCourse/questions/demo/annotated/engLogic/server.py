def selected_answer(data, answer_name):
    options = data["params"][answer_name]
    submitted_key = data["submitted_answers"].get(answer_name)
    return int(
        next(
            (option["html"] for option in options if option["key"] == submitted_key),
            "0",
        )
    )


def grade(data):
    # Note that these variables will not be None, because of the PL element parse function (they will be marked as invalid)
    x = selected_answer(data, "x")
    y = selected_answer(data, "y")
    z = selected_answer(data, "z")
    Fsub = selected_answer(data, "F")

    # This is used to eliminate the score for each entry
    data["partial_scores"]["x"] = {"score": None}
    data["partial_scores"]["y"] = {"score": None}
    data["partial_scores"]["z"] = {"score": None}
    data["partial_scores"]["F"] = {"score": None}

    Ftrue = int(((not y) and z) or x)

    if Ftrue == Fsub:
        data["score"] = 1
    else:
        data["feedback"]["F"] = (
            "For the given input, the correct answer should have been " + str(Ftrue)
        )
        data["score"] = 0
