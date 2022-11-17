import pytest
import big_o_utils as bou
from typing import Callable, List, Tuple

VARIABLES = ["n"]

BigoGradingFunctionT = Callable[[str, str, List[str]], Tuple[float, str]]

ALL_GRADING_FUNCTIONS = [
    bou.grade_bigo_expression,
    bou.grade_theta_expression,
    bou.grade_omega_expression,
    bou.grade_little_o_expression,
    bou.grade_little_omega_expression,
]


class TestBigOInput:
    @pytest.mark.parametrize("grading_fn", ALL_GRADING_FUNCTIONS)
    def test_correct_answer(self, grading_fn: BigoGradingFunctionT) -> None:
        a_true = "n**2"
        a_sub = "n**2"

        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert score == 1
        assert "Correct!" == feedback

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
        self, a_true: str, a_sub: str, grading_fn: BigoGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert score == 1
        assert "complex" in feedback

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
        self, a_true: str, a_sub: str, grading_fn: BigoGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert 0 < score < 1
        assert "lower order" in feedback

    @pytest.mark.parametrize(
        "a_true, a_sub",
        [
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
        self, a_true: str, a_sub: str, grading_fn: BigoGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert 0 < score < 1
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
        self, a_true: str, a_sub: str, grading_fn: BigoGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert score == 0
        assert "negative" in feedback

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
    @pytest.mark.parametrize(
        "grading_fn", [bou.grade_bigo_expression, bou.grade_little_o_expression]
    )
    def test_too_loose_bigo(
        self, a_true: str, a_sub: str, grading_fn: BigoGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert 0 < score < 1
        assert "loose" in feedback

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
    @pytest.mark.parametrize(
        "grading_fn", [bou.grade_omega_expression, bou.grade_little_omega_expression]
    )
    def test_too_loose_omega(
        self, a_true: str, a_sub: str, grading_fn: BigoGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert 0 < score < 1
        assert "loose" in feedback

    @pytest.mark.parametrize(
        "a_true, a_sub",
        [
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
            bou.grade_bigo_expression,
            bou.grade_theta_expression,
            bou.grade_little_o_expression,
        ],
    )
    def test_incorrect_answer_bigo(
        self, a_true: str, a_sub: str, grading_fn: BigoGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert score == 0
        assert "incorrect" in feedback

    @pytest.mark.parametrize(
        "a_true, a_sub",
        [
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
            bou.grade_little_omega_expression,
        ],
    )
    def test_incorrect_answer_omega(
        self, a_true: str, a_sub: str, grading_fn: BigoGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert score == 0
        assert "incorrect" in feedback or "Incorrect" in feedback


class TestExceptions:
    @pytest.mark.parametrize("a_sub", ["3.5", "3.5*n", "3.14159*n**2"])
    def test_no_floats(self, a_sub: str) -> None:
        with pytest.raises(bou.HasFloatError):
            bou.convert_string_to_sympy(a_sub, VARIABLES)

    @pytest.mark.parametrize("a_sub", ["5==5", "5!=5", "5>5", "5<5", "5>=5", "5<=5"])
    def test_invalid_expression(self, a_sub: str) -> None:
        with pytest.raises(bou.HasInvalidExpressionError):
            bou.convert_string_to_sympy(a_sub, VARIABLES)

    @pytest.mark.parametrize("a_sub", ["str(n)", "sin(n)", "cos(n)", "dir(n)"])
    def test_invalid_function(self, a_sub: str) -> None:
        with pytest.raises(bou.HasInvalidFunctionError):
            bou.convert_string_to_sympy(a_sub, VARIABLES)

    @pytest.mark.parametrize("a_sub", ["x", "y", "z*n"])
    def test_invalid_variable(self, a_sub: str) -> None:
        with pytest.raises(bou.HasInvalidVariableError):
            bou.convert_string_to_sympy(a_sub, VARIABLES)

    @pytest.mark.parametrize("a_sub", ["(", "n**", "n**2+"])
    def test_parse_error(self, a_sub: str) -> None:
        with pytest.raises(bou.HasParseError):
            bou.convert_string_to_sympy(a_sub, VARIABLES)

    def test_escape_error(self) -> None:
        with pytest.raises(bou.HasEscapeError):
            bou.convert_string_to_sympy("\\", VARIABLES)

    def test_comment_error(self) -> None:
        with pytest.raises(bou.HasCommentError):
            bou.convert_string_to_sympy("#", VARIABLES)
