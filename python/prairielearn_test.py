# lol
import sys
import os

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../lib"))
)

import prairielearn as pl  # noqa: E402
import lxml.html  # noqa: E402
import pytest
from typing import Dict, Optional, Any, Tuple


def test_inner_html() -> None:
    e = lxml.html.fragment_fromstring("<div>test</div>")
    assert pl.inner_html(e) == "test"

    e = lxml.html.fragment_fromstring("<div>test&gt;test</div>")
    assert pl.inner_html(e) == "test&gt;test"


@pytest.mark.parametrize(
    "question_name, student_answer, weight, expected_grade",
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
def test_grade_question_parametrized_correct(
    question_data: pl.QuestionData,
    question_name: str,
    student_answer: str,
    weight: int,
    expected_grade: bool,
) -> None:

    question_data["submitted_answers"] = {question_name: student_answer}

    good_feedback = "you did good"
    bad_feedback = "thats terrible"

    def grading_function(submitted_answer: str) -> Tuple[bool, Optional[str]]:
        if submitted_answer in {"a", "b", "c", "d", "<>"}:
            return True, good_feedback
        return False, bad_feedback

    pl.grade_question_parameterized(
        question_data, question_name, grading_function, weight
    )

    expected_score = 1.0 if expected_grade else 0.0
    assert question_data["partial_scores"][question_name]["score"] == expected_score
    assert type(question_data["partial_scores"][question_name]["score"]) == float

    assert "weight" in question_data["partial_scores"][question_name]
    assert question_data["partial_scores"][question_name].get("weight") == weight

    expected_feedback = good_feedback if expected_grade else bad_feedback

    assert (
        question_data["partial_scores"][question_name].get("feedback")
        == expected_feedback
    )


@pytest.mark.parametrize(
    "student_ans, error_msg",
    [("a", "stuff"), ("ab", "other stuff"), ("abc", "something else")],
)
def test_grade_question_parametrized_exception(
    question_data: pl.QuestionData, student_ans: str, error_msg: str
) -> None:

    question_name = "name"

    question_data["submitted_answers"] = {question_name: student_ans}

    def grading_function(_: str) -> Tuple[bool, Optional[str]]:
        raise ValueError(error_msg)

    pl.grade_question_parameterized(question_data, question_name, grading_function)

    assert question_data["partial_scores"][question_name]["score"] == 0.0
    assert question_data["format_errors"][question_name] == error_msg


def test_grade_question_parametrized_bad_grade_function(
    question_data: pl.QuestionData,
) -> None:
    question_name = "name"

    question_data["submitted_answers"] = {question_name: "True"}

    def grading_function(ans: str) -> Any:
        return "True", f"The answer {ans} is right"

    with pytest.raises(AssertionError):
        pl.grade_question_parameterized(question_data, question_name, grading_function)


def test_grade_question_parametrized_key_error_blank(
    question_data: pl.QuestionData,
) -> None:
    question_name = "name"

    question_data["submitted_answers"] = {question_name: "True"}

    def grading_function(_: str) -> Tuple[bool, Optional[str]]:
        decoy_dict: Dict[str, str] = dict()
        decoy_dict["junk"]  # This is to throw a key error
        return (True, None)

    with pytest.raises(KeyError):
        pl.grade_question_parameterized(question_data, question_name, grading_function)

    # Empty out submitted answers
    question_data["submitted_answers"] = dict()
    question_data["format_errors"] = dict()
    pl.grade_question_parameterized(question_data, question_name, grading_function)

    assert question_data["format_errors"][question_name] == "No answer was submitted"
