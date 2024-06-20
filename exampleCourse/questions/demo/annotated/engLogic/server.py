def grade(data):
    # Note that these variables will not be None, because of the PL element parse function (they will be marked as invalid)
    x = data["submitted_answers"].get("x")
    y = data["submitted_answers"].get("y")
    z = data["submitted_answers"].get("z")
    Fsub = data["submitted_answers"].get("F")

    # This is used to eliminate the score for each entry
    data["partial_scores"]["x"] = {"score": None}
    data["partial_scores"]["y"] = {"score": None}
    data["partial_scores"]["z"] = {"score": None}
    data["partial_scores"]["F"] = {"score": None}

    Ftrue = ((not y) and z) or x

    if Ftrue == Fsub:
        data["score"] = 1
    else:
        data["feedback"]["F"] = (
            "Fot the given input, the correct answer should have been " + str(Ftrue)
        )
        data["score"] = 0
