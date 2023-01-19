import json
import math
from enum import Enum
from typing import Callable, cast

import lxml.html
import pandas as pd
import prairielearn as pl
import pytest
from pytest_lazyfixture import lazy_fixture


@pytest.mark.parametrize(
    "df",
    lazy_fixture(["city_dataframe", "breast_cancer_dataframe", "r_types_dataframe"]),
)
def test_encoding_pandas(df: pd.DataFrame) -> None:
    """Test that new json encoding works"""

    # Test encoding as json doesn't throw exceptions
    json_df = pl.to_json(df, df_encoding_version=2)
    json_str = json.dumps(json_df)

    assert type(json_str) == str

    # Deserialize and check equality
    loaded_str = json.loads(json_str)
    deserialized_df = cast(pd.DataFrame, pl.from_json(loaded_str))

    # Column types get erased, need to account for this in testing
    reference_df = df.copy()
    reference_df.columns = reference_df.columns.astype("string").astype("object")

    pd.testing.assert_frame_equal(deserialized_df, reference_df)


@pytest.mark.parametrize(
    "df",
    lazy_fixture(["city_dataframe", "breast_cancer_dataframe", "r_types_dataframe"]),
)
def test_encoding_legacy(df: pd.DataFrame) -> None:
    """Add compatibility test for legacy encoding"""
    reserialized_dataframe = cast(pd.DataFrame, pl.from_json(pl.to_json(df)))
    pd.testing.assert_frame_equal(df, reserialized_dataframe)


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


class TestEnum(Enum):
    DEFAULT = 0
    TEST_CHOICE_1 = 1
    TEST_CHOICE_2 = 2
    TEST_CHOICE_3 = 3


@pytest.mark.parametrize(
    "html_str, expected_result",
    [
        ("<pl-thing></pl-thing>", TestEnum.DEFAULT),
        ('<pl-thing test-choice="default"></pl-thing>', TestEnum.DEFAULT),
        ('<pl-thing test-choice="test-choice-1"></pl-thing>', TestEnum.TEST_CHOICE_1),
        ('<pl-thing test-choice="test-choice-2"></pl-thing>', TestEnum.TEST_CHOICE_2),
        ('<pl-thing test-choice="test-choice-3"></pl-thing>', TestEnum.TEST_CHOICE_3),
    ],
)
def test_get_enum_attrib(html_str: str, expected_result: TestEnum) -> None:
    element = lxml.html.fragment_fromstring(html_str)
    result = pl.get_enum_attrib(element, "test-choice", TestEnum, TestEnum.DEFAULT)

    assert result is expected_result


@pytest.mark.parametrize(
    "html_str",
    [
        "<pl-thing></pl-thing>",
        '<pl-thing test-choice="DEFAULT"></pl-thing>',
        '<pl-thing test-choice="Default"></pl-thing>',
        '<pl-thing test-choice="test_choice_1"></pl-thing>',
    ],
)
def test_get_enum_attrib_exceptions(html_str: str) -> None:
    element = lxml.html.fragment_fromstring(html_str)

    with pytest.raises(Exception):
        pl.get_enum_attrib(element, "test-choice", TestEnum)
