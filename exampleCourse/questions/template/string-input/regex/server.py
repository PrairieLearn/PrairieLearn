from typing import assert_never

import prairielearn as pl


def test(data: pl.ElementTestData) -> None:
    # The correct answer is a regular expression, so pl-string-input cannot
    # generate its own test submissions. Provide them here instead.
    name = "macronutrient"
    result = data["test_type"]
    if result == "correct":
        data["raw_submitted_answers"][name] = "nitrogen"
        data["score"] = 1
        data["partial_scores"][name] = {"score": 1, "weight": 1}
    elif result == "incorrect":
        data["raw_submitted_answers"][name] = "carbon"
        data["partial_scores"][name] = {"score": 0, "weight": 1}
    elif result == "invalid":
        data["raw_submitted_answers"][name] = ""
        data["format_errors"][name] = "invalid"
    else:
        assert_never(result)
