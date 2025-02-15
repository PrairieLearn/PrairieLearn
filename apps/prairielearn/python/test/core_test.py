import itertools as it
import math
import string
from collections.abc import Callable
from typing import Any

import lxml.html
import pytest
from prairielearn.core import (
    QuestionData,
    clean_identifier_name,
    get_uuid,
    grade_answer_parameterized,
    index2key,
    inner_html,
    iter_keys,
    set_all_or_nothing_score_data,
    set_weighted_score_data,
)


@pytest.mark.parametrize(
    "inner_html_string",
    [
        "test",
        "test&gt;test",
        "some loose text <pl>other <b>bold</b> text</pl>"
        "some <p> other <b>words</b> are </p> here",
        '<p>Some flavor text.</p> <pl-thing some-attribute="4">answers</pl-thing>',
    ],
)
def test_inner_html(inner_html_string: str) -> None:
    e = lxml.html.fragment_fromstring(f"<div>{inner_html_string}</div>")
    assert inner_html(e) == inner_html_string


@pytest.mark.parametrize(
    ("weight_set_function", "score_1", "score_2", "score_3", "expected_score"),
    [
        # Check set weighted score data
        (set_weighted_score_data, 0.0, 0.0, 0.0, 0.0),
        (set_weighted_score_data, 0.0, 0.5, 0.0, 2.0 / 7.0),
        (set_weighted_score_data, 0.0, 0.75, 1.0, 4.0 / 7.0),
        (set_weighted_score_data, 0.5, 0.75, 1.0, 5.0 / 7.0),
        (set_weighted_score_data, 1.0, 1.0, 1.0, 1.0),
        # Check all or nothing weighted score data
        (set_all_or_nothing_score_data, 0.0, 0.0, 0.0, 0.0),
        (set_all_or_nothing_score_data, 0.5, 0.0, 1, 0.0),
        (set_all_or_nothing_score_data, 0.5, 0.75, 1.0, 0.0),
        (set_all_or_nothing_score_data, 1.0, 1.0, 1.0, 1.0),
    ],
)
def test_set_score_data(
    question_data: QuestionData,
    weight_set_function: Callable[[QuestionData], None],
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
    ("question_name", "student_answer", "weight", "expected_grade"),
    [
        ("base", "a", 1, True),
        ("base", "a, b", 1, False),
        ("base", "", 2, False),
        ("home", "b", 2, True),
        ("base", "c", 3, True),
        ("base", "<>", 3, True),
        ("base", "><", 3, False),
    ],
)
def test_grade_answer_parametrized_correct(
    question_data: QuestionData,
    question_name: str,
    student_answer: str,
    weight: int,
    expected_grade: bool,  # noqa: FBT001
) -> None:
    question_data["submitted_answers"] = {question_name: student_answer}

    good_feedback = "you did good"
    bad_feedback = "that's terrible"

    def grading_function(submitted_answer: str) -> tuple[bool, str | None]:
        if submitted_answer in {"a", "b", "c", "d", "<>"}:
            return True, good_feedback
        return False, bad_feedback

    grade_answer_parameterized(question_data, question_name, grading_function, weight)

    expected_score = 1.0 if expected_grade else 0.0
    assert question_data["partial_scores"][question_name]["score"] == expected_score
    assert isinstance(question_data["partial_scores"][question_name]["score"], float)

    assert "weight" in question_data["partial_scores"][question_name]
    assert question_data["partial_scores"][question_name].get("weight") == weight

    expected_feedback = good_feedback if expected_grade else bad_feedback

    assert (
        question_data["partial_scores"][question_name].get("feedback")
        == expected_feedback
    )


def test_grade_answer_parametrized_bad_grade_function(
    question_data: QuestionData,
) -> None:
    question_name = "name"

    question_data["submitted_answers"] = {question_name: "True"}

    def grading_function(ans: str) -> Any:
        return "True", f"The answer {ans} is right"

    with pytest.raises(AssertionError):
        grade_answer_parameterized(question_data, question_name, grading_function)


def test_grade_answer_parametrized_key_error_blank(
    question_data: QuestionData,
) -> None:
    question_name = "name"

    question_data["submitted_answers"] = {question_name: "True"}

    def grading_function(_: str) -> tuple[bool, str | None]:
        decoy_dict: dict[str, str] = {}
        decoy_dict["junk"]  # This is to throw a key error
        return (True, None)

    with pytest.raises(KeyError):
        grade_answer_parameterized(question_data, question_name, grading_function)

    # Empty out submitted answers
    question_data["submitted_answers"] = {}
    question_data["format_errors"] = {}
    grade_answer_parameterized(question_data, question_name, grading_function)

    assert question_data["partial_scores"][question_name]["score"] == 0.0


@pytest.mark.repeat(100)
def test_get_uuid() -> None:
    """Test basic properties of the get_uuid() function."""

    pl_uuid = get_uuid()
    clauses = pl_uuid.split("-")

    # Assert clauses have standard structure.
    assert len(clauses) == 5
    assert list(map(len, clauses)) == [8, 4, 4, 4, 12]

    # Assert that all characters are valid.
    seen_characters = set().union(*(clause for clause in clauses))
    allowed_hex_characters = set(string.hexdigits[:16])
    assert seen_characters.issubset(allowed_hex_characters)

    # Assert that the first character is a valid hex letter.
    assert pl_uuid[0] in set("abcdef")


@pytest.mark.parametrize(
    ("length", "expected_output"),
    [
        (1, ["a"]),
        (2, ["a", "b"]),
        (4, ["a", "b", "c", "d"]),
    ],
)
def test_iter_keys(length: int, expected_output: list[str]) -> None:
    assert list(it.islice(iter_keys(), length)) == expected_output


@pytest.mark.parametrize(
    ("idx", "expected_output"),
    [(0, "a"), (1, "b"), (3, "d"), (26, "aa"), (27, "ab")],
)
def test_index2key(idx: int, expected_output: str) -> None:
    assert index2key(idx) == expected_output


@pytest.mark.parametrize(
    ("input_name", "expected_output"),
    [
        # Basic alphanumeric cases
        ("abc", "abc"),
        ("ABC", "ABC"),
        ("abc123", "abc123"),
        ("123abc", "abc"),
        # Special characters
        ("hello#world", "hello_world"),
        ("hello.$world", "hello__world"),
        ("hello##`'\"world", "hello_____world"),
        ("hello  world 123", "hello__world_123"),
        # Leading special characters
        ("_hello", "hello"),
        ("123hello", "hello"),
        # Mixed cases
        ("HelloWorld!", "HelloWorld_"),
        ("hello_World_123", "hello_World_123"),
        ("123_hello_world", "hello_world"),
        ("___hello___", "hello___"),
        # Edge cases
        ("", ""),
        ("___", ""),
        ("123", ""),
        ("123_456", ""),
        ("!@#$%", ""),
        # Unicode characters
        ("hello™world→", "hello_world_"),
    ],
)
def test_clean_identifier_name(*, input_name: str, expected_output: str) -> None:
    """Test clean_identifier_name with various input strings."""
    assert clean_identifier_name(input_name) == expected_output
