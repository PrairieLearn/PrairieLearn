import json


def grade(data):
    data["score"] = 1


def test(data):
    if data["test_type"] == "invalid":
        return

    # Need to submit *something*, so that pl-drawing can parse the answer
    data["raw_submitted_answers"]["answer"] = json.dumps([
        {"gradingName": "pl-text", "graded": 1},
    ])

    data["score"] = 1

    # This is 'correct' even if pl-drawing can't grade it.
    data["partial_scores"]["answer"] = {
        "score": 1,
        "weight": 1,
        "feedback": {"correct": True, "matches": {}, "missing": {}},
    }
