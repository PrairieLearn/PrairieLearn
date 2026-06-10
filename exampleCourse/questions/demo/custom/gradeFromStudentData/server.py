import math

import prairielearn as pl


def generate(data):
    # Reference values for the physical measurements. Each student takes their
    # own measurements, so submissions are graded against these references with
    # generous tolerances (set on each pl-number-input in question.html).
    data["correct_answers"]["L"] = 0.5
    data["correct_answers"]["t"] = 14.2


def parse(data):
    # Sanity-check the recorded measurements. Marking implausible values as
    # format errors keeps the submission from being graded (and from using up
    # one of the student's attempts).
    for name in ["L", "t", "g"]:
        var = data["submitted_answers"].get(name)
        if var is None:
            data["format_errors"][name] = f"Variable {name} is not defined"
        elif name == "L" and not (0.1 <= var <= 2):
            data["format_errors"][name] = (
                "The pendulum length is outside the range of acceptable values for this experiment. Check your units?"
            )
        elif name == "t" and not (3 <= var <= 60):
            data["format_errors"][name] = (
                "The recorded time looks implausible for ten swings. Check your units?"
            )


def grade(data):
    # The expected value of g is computed from the student's own recorded
    # measurements, not from the reference values, so any answer consistent
    # with the recorded data is accepted.
    submitted = data["submitted_answers"]
    period = submitted["t"] / 10
    g = 4 * math.pi**2 * submitted["L"] / period**2

    if math.isclose(submitted["g"], g, rel_tol=1e-3):
        data["partial_scores"]["g"] = {"score": 1, "weight": 1}
    else:
        data["partial_scores"]["g"] = {"score": 0, "weight": 1}
        data["feedback"]["g"] = (
            "Your value for $g$ is not consistent with your recorded measurements."
        )

    pl.set_weighted_score_data(data)


def test(data):
    if data["test_type"] == "invalid":
        return

    is_correct = data["test_type"] == "correct"
    correct = data["correct_answers"]

    # g has no fixed correct answer, so pl-number-input defers generating its
    # test data to this function.
    period = correct["t"] / 10
    g = 4 * math.pi**2 * correct["L"] / period**2
    offset = 0 if is_correct else 1
    data["raw_submitted_answers"]["g"] = str(g + offset)

    score = 1 if is_correct else 0
    data["partial_scores"]["g"] = {"score": score, "weight": 1}
    data["score"] = score
