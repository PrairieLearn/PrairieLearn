from typing import Any, Dict, Optional, Tuple

import big_o_utils as bou
import prairielearn as pl
import pytest
import python_helper_sympy as phs

VARIABLES = ["n"]

ALL_GRADING_FUNCTIONS = [
    bou.grade_o_expression,
    bou.grade_theta_expression,
    bou.grade_omega_expression,
]


class TestBigOInput:
    @pytest.mark.parametrize("grading_fn", ALL_GRADING_FUNCTIONS)
    @pytest.mark.parametrize("a_sub", ["n**2", "n ** 2"])
    def test_correct_answer(
        self, a_sub: str, grading_fn: bou.BigOGradingFunctionT
    ) -> None:
        a_true = "n**2"

        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert score == 1.0
        assert feedback == bou.CORRECT_UNCONDITIONAL_FEEDBACK

    @pytest.mark.parametrize(
        "a_true, a_sub",
        [
            ("log(n)", "1*log(n)"),
            ("log(n)", "log(n-n+n)"),
            ("n**2", "n**(2)"),
            ("n**2", "n**(1+1)"),
            ("n**2", "n**(1+1-1+1)"),
            ("2**n", "2**(n)"),
            ("2**n", "(1+1)**n"),
        ],
    )
    @pytest.mark.parametrize("grading_fn", ALL_GRADING_FUNCTIONS)
    def test_semantically_correct_answer(
        self, a_true: str, a_sub: str, grading_fn: bou.BigOGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert score == 1.0
        assert feedback == bou.CORRECT_COMPLEX_FEEDBACK

    @pytest.mark.parametrize(
        "a_true, a_sub",
        [
            ("log(n)", "log(n)+log(log(n))"),
            ("log(n)", "log(n)+42"),
            ("n**2", "n**2 + n"),
            ("n**2", "n**2 + log(n)"),
            ("n**2", "n**2 + log(n) + 5*n + 5"),
            ("2**n", "2**n + n**100"),
            ("2**n", "2**n + log(n)"),
        ],
    )
    @pytest.mark.parametrize("grading_fn", ALL_GRADING_FUNCTIONS)
    def test_lower_order_terms(
        self, a_true: str, a_sub: str, grading_fn: bou.BigOGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert 0.0 < score < 1.0
        assert "lower order" in feedback

    @pytest.mark.parametrize(
        "a_true, a_sub",
        [
            ("1", "14"),
            ("1", "20"),
            ("log(n)", "7*log(n)"),
            ("log(n)", "(32/3)*log(n)"),
            ("n**2", "2*n**2"),
            ("n**2", "16*n**2"),
            ("n**2", "(3/4)*n**2"),
            ("2**n", "5*2**n"),
            ("2**n", "(6000/523)*2**n"),
        ],
    )
    @pytest.mark.parametrize("grading_fn", ALL_GRADING_FUNCTIONS)
    def test_unnecessary_constants(
        self, a_true: str, a_sub: str, grading_fn: bou.BigOGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert 0.0 < score < 1.0
        assert "constant" in feedback

    @pytest.mark.parametrize(
        "a_true, a_sub",
        [
            ("log(n)", "-log(n**2)"),
            ("log(n)", "-log(n**3)"),
            ("n**2", "-n**4"),
            ("n**2", "-n**5"),
            ("n**2", "-n**6"),
            ("2**n", "-2**(2*n)"),
            ("2**n", "-2**(3*n)"),
            ("-n**2", "n"),
        ],
    )
    @pytest.mark.parametrize("grading_fn", ALL_GRADING_FUNCTIONS)
    def test_negative_submission(
        self, a_true: str, a_sub: str, grading_fn: bou.BigOGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert score == 0.0
        assert feedback == bou.NEGATIVE_FEEDBACK

    @pytest.mark.parametrize(
        "a_true, a_sub",
        [
            ("log(n)", "n*log(n)"),
            ("log(n)", "n**2"),
            ("log(n)", "n+log(n)"),
            ("n**2", "n**3"),
            ("n**2", "n**4"),
            ("n**2", "factorial(n)"),
            ("n**2", "n**2*log(n)"),
            ("2**n", "n**n"),
            ("2**n", "factorial(n)"),
            ("2**n", "2**(n**2)"),
        ],
    )
    def test_too_loose_bigo(self, a_true: str, a_sub: str) -> None:
        score, feedback = bou.grade_o_expression(a_true, a_sub, VARIABLES)

        assert 0.0 < score < 1.0
        assert feedback == bou.TOO_LOOSE_FEEDBACK

    @pytest.mark.parametrize(
        "a_true, a_sub",
        [
            ("n*log(n)", "log(n)"),
            ("n**2", "log(n)"),
            ("n+log(n)", "log(n)"),
            ("n**3", "n**2"),
            ("n**4", "n**2"),
            ("factorial(n)", "n**2"),
            ("n**2*log(n)", "n**2"),
            ("n**n", "2**n"),
            ("factorial(n)", "2**n"),
            ("2**(n**2)", "2**n"),
        ],
    )
    def test_too_loose_omega(self, a_true: str, a_sub: str) -> None:
        score, feedback = bou.grade_omega_expression(a_true, a_sub, VARIABLES)

        assert 0.0 < score < 1.0
        assert feedback == bou.TOO_LOOSE_FEEDBACK

    @pytest.mark.parametrize(
        "a_true, a_sub",
        [
            ("log(n)", "0"),
            ("log(n)", "1"),
            ("log(n)", "log(log(n))"),
            ("n**2", "1"),
            ("n**2", "n"),
            ("n**2", "log(n)"),
            ("2**n", "n**1000"),
            ("2**n", "(3/2)**n"),
        ],
    )
    @pytest.mark.parametrize(
        "grading_fn",
        [
            bou.grade_o_expression,
            bou.grade_theta_expression,
        ],
    )
    def test_incorrect_answer_bigo(
        self, a_true: str, a_sub: str, grading_fn: bou.BigOGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert score == 0.0
        assert feedback == bou.INCORRECT_FEEDBACK

    @pytest.mark.parametrize(
        "a_true, a_sub",
        [
            ("log(n)", "0"),
            ("1", "log(n)"),
            ("log(log(n))", "log(n)"),
            ("1", "n**2"),
            ("n", "n**2"),
            ("log(n)", "n**2"),
            ("n**1000", "2**n"),
            ("(3/2)**n", "2**n"),
        ],
    )
    @pytest.mark.parametrize(
        "grading_fn",
        [
            bou.grade_omega_expression,
            bou.grade_theta_expression,
        ],
    )
    def test_incorrect_answer_omega(
        self, a_true: str, a_sub: str, grading_fn: bou.BigOGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert score == 0.0
        assert feedback == bou.INCORRECT_FEEDBACK


class TestExceptions:
    @pytest.mark.parametrize("a_sub", ["tan(n)", "sin(n)", "cos(n)", "arccos(n)"])
    @pytest.mark.parametrize("grading_fn", ALL_GRADING_FUNCTIONS)
    def test_invalid_trig_function(
        self, a_sub: str, grading_fn: bou.BigOGradingFunctionT
    ) -> None:
        a_true = "n**2"

        # Test for invalid functions in student submission and solution
        with pytest.raises(phs.HasInvalidFunctionError):
            grading_fn(a_true, a_sub, VARIABLES)

        with pytest.raises(phs.HasInvalidFunctionError):
            grading_fn(a_sub, a_true, VARIABLES)


# Start of generic utilites tests. Move these to prairieleran_test.py as needed

# TODO get rid of this fixture once functions/tests get promoted (duplicate fixture)
@pytest.fixture
def question_data() -> pl.QuestionData:
    return {
        "params": dict(),
        "correct_answers": dict(),
        "submitted_answers": dict(),
        "format_errors": dict(),
        "partial_scores": dict(),
        "score": 0.0,
        "feedback": dict(),
        "variant_seed": "",
        "options": dict(),
        "raw_submitted_answers": dict(),
        "editable": False,
        "panel": "question",
        "extensions": dict(),
        "num_valid_submissions": 0,
    }


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
def test_grade_answer_parametrized_correct(
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

    bou.grade_answer_parameterized(
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


def test_grade_answer_parametrized_bad_grade_function(
    question_data: pl.QuestionData,
) -> None:
    question_name = "name"

    question_data["submitted_answers"] = {question_name: "True"}

    def grading_function(ans: str) -> Any:
        return "True", f"The answer {ans} is right"

    with pytest.raises(AssertionError):
        bou.grade_answer_parameterized(question_data, question_name, grading_function)


def test_grade_answer_parametrized_key_error_blank(
    question_data: pl.QuestionData,
) -> None:
    question_name = "name"

    question_data["submitted_answers"] = {question_name: "True"}

    def grading_function(_: str) -> Tuple[bool, Optional[str]]:
        decoy_dict: Dict[str, str] = dict()
        decoy_dict["junk"]  # This is to throw a key error
        return (True, None)

    with pytest.raises(KeyError):
        bou.grade_answer_parameterized(question_data, question_name, grading_function)

    # Empty out submitted answers
    question_data["submitted_answers"] = dict()
    question_data["format_errors"] = dict()
    bou.grade_answer_parameterized(question_data, question_name, grading_function)

    assert question_data["format_errors"][question_name] == "No answer was submitted"
