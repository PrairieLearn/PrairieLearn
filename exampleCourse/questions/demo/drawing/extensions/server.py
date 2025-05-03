import json


def grade(data):
    data["score"] = 1


def test(data):
    if data["test_type"] != "correct":
        raise NotImplementedError

    # Need to submit *something*, so that pl-drawing can parse the answer
    data["raw_submitted_answers"]["answer"] = json.dumps([
        {"gradingName": "pl-text", "graded": 1},
    ])
