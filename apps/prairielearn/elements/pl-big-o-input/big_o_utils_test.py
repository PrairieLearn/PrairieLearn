import big_o_utils as bou
import pytest
import python_helper_sympy as phs

VARIABLES = ["n"]

ALL_GRADING_FUNCTIONS = [
    bou.grade_o_expression,
    bou.grade_theta_expression,
    bou.grade_omega_expression,
]


class TestBigOInput:
    @pytest.mark.parametrize(
        "a_true, a_sub",
        [
            ("n**2", "n**2"),
            ("n**2", "n ** 2"),
            ("n**2", "n^2"),
            ("n^2", "n**2"),
            ("factorial(n)", "n!"),
            ("log(n)", "log n"),
            ("n*log(n)**2", "n log^2 n"),
        ],
    )
    @pytest.mark.parametrize("grading_fn", ALL_GRADING_FUNCTIONS)
    def test_correct_answer(
        self, a_true: str, a_sub: str, grading_fn: bou.BigOGradingFunctionT
    ) -> None:
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
            ("factorial(n)", "n * factorial(n-1)"),
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
            ("log(n)", "log(n^2)"),
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
            ("n**2", "n!"),
            ("n**2", "n**2*log(n)"),
            ("2**n", "n**n"),
            ("2**n", "factorial(n)"),
            ("2**n", "n!"),
            ("2**n", "2**(n**2)"),
            ("factorial(n-1)", "factorial(n)"),
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
            ("n!", "n**2"),
            ("n**2*log(n)", "n**2"),
            ("n**n", "2**n"),
            ("factorial(n)", "2**n"),
            ("n!", "2**n"),
            ("2**(n**2)", "2**n"),
            ("factorial(n)", "factorial(n-1)"),
        ],
    )
    def test_too_loose_omega(self, a_true: str, a_sub: str) -> None:
        score, feedback = bou.grade_omega_expression(a_true, a_sub, VARIABLES)

        assert 0.0 < score < 1.0
        assert feedback == bou.TOO_LOOSE_FEEDBACK

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
            ("factorial(n)", "factorial(n-1)"),
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
            ("1", "log(n)"),
            ("log(log(n))", "log(n)"),
            ("1", "n**2"),
            ("n", "n**2"),
            ("log(n)", "n**2"),
            ("n**1000", "2**n"),
            ("(3/2)**n", "2**n"),
            ("factorial(n-1)", "factorial(n)"),
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

    @pytest.mark.parametrize("a_true", ["1", "log(n)", "n", "n**2"])
    @pytest.mark.parametrize(
        "a_sub", ["0", "1/0", "0/0", "1/log(1)", "1/(log(1))**2", "n**(1/log(1))"]
    )
    @pytest.mark.parametrize("grading_fn", ALL_GRADING_FUNCTIONS)
    def test_invalid_answer(
        self, a_true: str, a_sub: str, grading_fn: bou.BigOGradingFunctionT
    ) -> None:
        score, feedback = grading_fn(a_true, a_sub, VARIABLES)

        assert score == 0.0
        assert feedback == bou.TYPE_ERROR_FEEDBACK


class TestExceptions:
    @pytest.mark.parametrize("a_sub", ["tan(n)", "sin(n)", "cos(n)", "arccos(n)"])
    @pytest.mark.parametrize("grading_fn", ALL_GRADING_FUNCTIONS)
    def test_invalid_trig_function(
        self, a_sub: str, grading_fn: bou.BigOGradingFunctionT
    ) -> None:
        a_true = "n**2"

        # Test for invalid functions in student submission and solution
        with pytest.raises((phs.HasInvalidSymbolError, phs.HasInvalidFunctionError)):
            grading_fn(a_true, a_sub, VARIABLES)

        with pytest.raises((phs.HasInvalidSymbolError, phs.HasInvalidFunctionError)):
            grading_fn(a_sub, a_true, VARIABLES)
