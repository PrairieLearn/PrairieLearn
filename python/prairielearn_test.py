import json
import math
from typing import Any, Callable

import lxml.html
import numpy as np
import prairielearn as pl
import pytest


def test_inner_html() -> None:
    e = lxml.html.fragment_fromstring("<div>test</div>")
    assert pl.inner_html(e) == "test"

    e = lxml.html.fragment_fromstring("<div>test&gt;test</div>")
    assert pl.inner_html(e) == "test&gt;test"


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
        "p1": {"score": score_1, "weight": 2},
        "p2": {"score": score_2, "weight": 4},
        "p3": {"score": score_3},  # No weight tests default behavior
    }

    # Assert equality
    weight_set_function(question_data)
    assert math.isclose(question_data["score"], expected_score)


@pytest.mark.parametrize(
    "numpy_object",
    [
        np.int64(5),
        np.int32(-12),
        np.uint8(55),
        np.byte(3),
        np.float128(-1100204.04010340),
        np.float32(2.1100044587483),
        np.float16(0.00000184388328),
        np.int64((2**53) + 5),
        np.complex128("12+3j"),
        np.complex256("12+3j"),
        np.arange(15),
        np.array([1.2, 3.5, 5.1]),
        np.array([1, 2, 3, 4]),
        np.array([(1.5, 2, 3), (4, 5, 6)]),
        np.array([[1, 2], [3, 4]], dtype=complex),
        np.ones((2, 3, 4), dtype=np.int16),
    ],
)
def test_numpy_serialization(numpy_object: Any) -> None:
    """Test equality after conversion of various numpy objects."""

    json_object = json.dumps(pl.to_json(numpy_object, np_encoding=2), allow_nan=False)
    decoded_json_object = pl.from_json(json.loads(json_object))

    assert type(numpy_object) == type(decoded_json_object)
    np.testing.assert_array_equal(numpy_object, decoded_json_object)


@pytest.mark.parametrize(
    "old_object_to_encode",
    [
        np.int64(5),
        np.float16(0.00000184388328),
    ],
)
def test_legacy_serialization(old_object_to_encode: Any) -> None:
    """Test that nothing happens under the old encoding for numpy scalars."""

    encoded_object = pl.to_json(old_object_to_encode)

    assert type(old_object_to_encode) == type(encoded_object)
    assert old_object_to_encode == encoded_object


def test_legacy_complex_serialization() -> None:
    """Test legacy complex serialization."""

    complex_num_string = "12+3j"

    encoded_object = pl.from_json(pl.to_json(np.complex128(complex_num_string)))
    expected_result = complex(complex_num_string)

    assert type(expected_result) == type(encoded_object)
    assert expected_result == encoded_object
