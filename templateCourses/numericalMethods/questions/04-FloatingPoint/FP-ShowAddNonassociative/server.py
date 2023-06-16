def grade(data):

    # get the submitted answers
    x = data["submitted_answers"].get("x", None)
    y = data["submitted_answers"].get("y", None)
    z = data["submitted_answers"].get("z", None)

    a = x + (y + z)
    b = (x + y) + z

    if a != b:
        data["score"] = 1.0

    else:
        data["score"] = 0
        # data['partial_scores']['x'] = {'score': 0}
        # data['partial_scores']['y'] = {'score': 0}
        # data['partial_scores']['z'] = {'score': 0}
