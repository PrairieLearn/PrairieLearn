import math

import prairielearn as pl


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
    # The measurements themselves have no correct answer and are not graded.
    # The expected value of g is computed from the student's own recorded
    # measurements, so any answer consistent with the recorded data is
    # accepted.
    submitted = data["submitted_answers"]
    period = submitted["t"] / 10
    g = 4 * math.pi**2 * submitted["L"] / period**2

    # The relative tolerance matches the rtol shown on the input in
    # question.html, since the element itself does not grade this input.
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

    # None of the inputs have a correct answer, so pl-number-input defers
    # generating all of the test data to this function.
    L = 0.5
    t = 14.2
    data["raw_submitted_answers"]["L"] = str(L)
    data["raw_submitted_answers"]["t"] = str(t)

    is_correct = data["test_type"] == "correct"
    g = 4 * math.pi**2 * L * (10 / t) ** 2
    offset = 0 if is_correct else 1
    data["raw_submitted_answers"]["g"] = str(g + offset)

    score = 1 if is_correct else 0
    data["partial_scores"]["g"] = {"score": score, "weight": 1}
    data["score"] = score
