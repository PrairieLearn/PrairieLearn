import json


def grade(data):
    submitted = data["submitted_answers"]["answer"]
    blue = "#0000FF"
    green = "#008000"
    red = "#FF0000"

    has_blue = False
    has_green = False
    has_red = False
    for element in submitted:
        if element["gradingName"] == "pl-circle":
            color = element["fill"]
            if color == blue:
                has_blue = True
            elif color == green:
                has_green = True
            elif color == red:
                has_red = True

    data["score"] = (float(has_blue) + float(has_green) + float(has_red)) / 3.0


def test(data):
    if data["test_type"] == "invalid":
        return

    correct = data["test_type"] == "correct"
    fill1, fill2, fill3 = (
        ["#0000FF", "#008000", "#FF0000"]
        if correct
        else ["#000000", "#000000", "#000000"]
    )
    data["raw_submitted_answers"]["answer"] = json.dumps([
        {"gradingName": "pl-circle", "fill": fill1, "graded": 1},
        {"gradingName": "pl-circle", "fill": fill2, "graded": 1},
        {"gradingName": "pl-circle", "fill": fill3, "graded": 1},
    ])

    data["score"] = 1 if correct else 0

    # This is 'correct' in partial_scores even if pl-drawing can't grade it.
    data["partial_scores"]["answer"] = {
        "score": 1,
        "weight": 1,
        "feedback": {"correct": True, "matches": {}, "missing": {}},
    }
