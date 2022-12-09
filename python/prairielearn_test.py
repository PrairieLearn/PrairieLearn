# lol
import sys
import os

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../lib"))
)

import prairielearn as pl  # noqa: E402
import lxml.html  # noqa: E402
import pytest
import math
from typing import Callable, Optional


def test_inner_html() -> None:
    e = lxml.html.fragment_fromstring("<div>test</div>")
    assert pl.inner_html(e) == "test"

    e = lxml.html.fragment_fromstring("<div>test&gt;test</div>")
    assert pl.inner_html(e) == "test&gt;test"


def prepare_partial_score_dict(
    score: float, weight: Optional[int] = None
) -> pl.PartialScore:
    if weight is not None:
        return {"score": score, "weight": weight}

    return {"score": score}


@pytest.mark.parametrize(
    "weight_set_function, score_1, score_2, score_3, expected_score",
    [
        # Check set weighted score data
        (pl.set_weighted_score_data, 0.0, 0.0, 0.0, 0.0),
        (pl.set_weighted_score_data, 0.0, 0.5, 0.0, 2.0 / 7.0),
        (pl.set_weighted_score_data, 0.0, 0.75, 1.0, 4.0 / 7.0),
        (pl.set_weighted_score_data, 0.5, 0.75, 1.0, 5.0 / 7.0),
        (pl.set_weighted_score_data, 1.0, 1.0, 1.0, 1.0),
        # Check all or nothing weighted score data
        (pl.set_all_or_nothing_score_data, 0.0, 0.0, 0.0, 0.0),
        (pl.set_all_or_nothing_score_data, 0.5, 0.0, 1, 0.0),
        (pl.set_all_or_nothing_score_data, 0.5, 0.75, 1.0, 0.0),
        (pl.set_all_or_nothing_score_data, 1.0, 1.0, 1.0, 1.0),
    ],
)
def test_set_score_data(
    question_data: pl.QuestionData,
    weight_set_function: Callable[[pl.QuestionData], None],
    score_1: float,
    score_2: float,
    score_3: float,
    expected_score: float,
) -> None:

    question_data["partial_scores"] = {
        "p1": prepare_partial_score_dict(score_1, 2),
        "p2": prepare_partial_score_dict(score_2, 4),
        "p3": prepare_partial_score_dict(score_3),  # No weight tests default behavior
    }

    # Assert equality
    weight_set_function(question_data)
    assert math.isclose(question_data["score"], expected_score)
