"""
Tests for refactored pl-checkbox element.

These tests verify that the refactoring (internal enums, extracted functions)
maintains the exact same behavior as the original code.
"""

import importlib
from typing import Any, NamedTuple

import lxml.html
import pytest

pl_checkbox = importlib.import_module("pl-checkbox")


def create_test_data(
    submitted: list[str], correct: list[str], all_params: list[str] | None = None
) -> dict[str, Any]:
    """Helper to create test data structure."""
    if all_params is None:
        all_keys = list(set(submitted + correct))
    else:
        all_keys = all_params
    params = [{"key": key} for key in all_keys]
    correct_answers = [{"key": key} for key in correct]

    return {
        "submitted_answers": {"test": submitted},
        "correct_answers": {"test": correct_answers},
        "params": {"test": params},
        "partial_scores": {},
    }


# Named tuples for test parameters
class HelpTextTestCase(NamedTuple):
    num_correct: int
    num_display: int
    show_num: bool
    detailed: bool
    has_min: bool
    has_max: bool
    min_val: int
    max_val: int
    expected: str
    id: str


# Tests for generate_help_text() function
@pytest.mark.parametrize(
    "case",
    [
        # Min select only
        HelpTextTestCase(
            num_correct=3,
            num_display=5,
            show_num=False,
            detailed=False,
            has_min=True,
            has_max=False,
            min_val=2,
            max_val=5,
            expected=" at least <b>2</b> options.",
            id="min_select_only",
        ),
        # Max select only
        HelpTextTestCase(
            num_correct=2,
            num_display=5,
            show_num=False,
            detailed=False,
            has_min=False,
            has_max=True,
            min_val=1,
            max_val=3,
            expected=" at most <b>3</b> options.",
            id="max_select_only",
        ),
        # Min and max different
        HelpTextTestCase(
            num_correct=3,
            num_display=5,
            show_num=False,
            detailed=False,
            has_min=True,
            has_max=True,
            min_val=2,
            max_val=4,
            expected=" between <b>2</b> and <b>4</b> options.",
            id="min_and_max_different",
        ),
        # Min and max same
        HelpTextTestCase(
            num_correct=3,
            num_display=5,
            show_num=False,
            detailed=False,
            has_min=True,
            has_max=True,
            min_val=3,
            max_val=3,
            expected=" exactly <b>3</b> options.",
            id="min_and_max_same",
        ),
        # Detailed help text
        HelpTextTestCase(
            num_correct=3,
            num_display=5,
            show_num=False,
            detailed=True,
            has_min=False,
            has_max=False,
            min_val=1,
            max_val=4,
            expected=" between <b>1</b> and <b>4</b> options.",
            id="detailed_help_different",
        ),
        HelpTextTestCase(
            num_correct=2,
            num_display=5,
            show_num=False,
            detailed=True,
            has_min=False,
            has_max=False,
            min_val=2,
            max_val=2,
            expected=" exactly <b>2</b> options.",
            id="detailed_help_same",
        ),
        # Combined with show number correct
        HelpTextTestCase(
            num_correct=3,
            num_display=5,
            show_num=True,
            detailed=True,
            has_min=False,
            has_max=False,
            min_val=2,
            max_val=4,
            expected=" between <b>2</b> and <b>4</b> options. There are exactly <b>3</b> correct options in the list above.",
            id="detailed_with_show_correct",
        ),
    ],
    ids=lambda case: case.id,
)
def test_generate_help_text(case: HelpTextTestCase) -> None:
    """Test the extracted generate_help_text function."""
    result = pl_checkbox.generate_insert_text(
        num_correct=case.num_correct,
        num_display_answers=case.num_display,
        show_number_correct=case.show_num,
        detailed_help_text=case.detailed,
        has_min_select_attrib=case.has_min,
        has_max_select_attrib=case.has_max,
        min_options_to_select=case.min_val,
        max_options_to_select=case.max_val,
    )
    assert result == case.expected


class GradingTestCase(NamedTuple):
    partial_credit: str
    method: str | None
    submitted: list[str]
    correct: list[str]
    all_params: list[str] | None
    expected_score: float
    id: str


# Tests for grading logic with OLD API (partial-credit + partial-credit-method)
@pytest.mark.parametrize(
    "case",
    [
        # No partial credit
        GradingTestCase(
            partial_credit="false",
            method=None,
            submitted=["a", "b"],
            correct=["a", "b"],
            all_params=None,
            expected_score=1.0,
            id="no_pc_perfect",
        ),
        GradingTestCase(
            partial_credit="false",
            method=None,
            submitted=["a"],
            correct=["a", "b"],
            all_params=None,
            expected_score=0.0,
            id="no_pc_imperfect",
        ),
        # PC method (net correct)
        GradingTestCase(
            partial_credit="true",
            method="PC",
            submitted=["a", "b"],
            correct=["a", "b"],
            all_params=None,
            expected_score=1.0,
            id="pc_perfect",
        ),
        GradingTestCase(
            partial_credit="true",
            method="PC",
            submitted=["a", "b", "c"],
            correct=["a", "b"],
            all_params=None,
            expected_score=0.5,
            id="pc_partial",
        ),
        GradingTestCase(
            partial_credit="true",
            method="PC",
            submitted=["c", "d"],
            correct=["a", "b"],
            all_params=None,
            expected_score=0.0,
            id="pc_zero",
        ),
        # EDC method (each answer)
        GradingTestCase(
            partial_credit="true",
            method="EDC",
            submitted=["a", "b"],
            correct=["a", "b"],
            all_params=["a", "b", "c", "d"],
            expected_score=1.0,
            id="edc_perfect",
        ),
        GradingTestCase(
            partial_credit="true",
            method="EDC",
            submitted=["a", "c"],
            correct=["a", "b"],
            all_params=["a", "b", "c", "d"],
            expected_score=0.5,
            id="edc_partial",
        ),
        # COV method (coverage)
        GradingTestCase(
            partial_credit="true",
            method="COV",
            submitted=["a", "b"],
            correct=["a", "b"],
            all_params=None,
            expected_score=1.0,
            id="cov_perfect",
        ),
        GradingTestCase(
            partial_credit="true",
            method="COV",
            submitted=["a", "b", "c"],
            correct=["a", "b"],
            all_params=None,
            expected_score=(2 / 2) * (2 / 3),
            id="cov_guessing_penalty",
        ),
        # Default method (PC)
        GradingTestCase(
            partial_credit="true",
            method=None,
            submitted=["a", "b", "c"],
            correct=["a", "b"],
            all_params=None,
            expected_score=0.5,
            id="default_method",
        ),
    ],
    ids=lambda case: case.id,
)
def test_grading_with_old_api(case: GradingTestCase) -> None:
    """Test that grading works correctly with OLD API (boolean partial-credit + method)."""
    attrs = 'answers-name="test"'
    attrs += f' partial-credit="{case.partial_credit}"'
    if case.method:
        attrs += f' partial-credit-method="{case.method}"'

    element_html = f"<pl-checkbox {attrs}></pl-checkbox>"
    data = create_test_data(case.submitted, case.correct, case.all_params)

    pl_checkbox.grade(element_html, data)

    actual_score = data["partial_scores"]["test"]["score"]
    if isinstance(case.expected_score, float) and case.expected_score not in [0.0, 1.0]:
        assert abs(actual_score - case.expected_score) < 0.0001
    else:
        assert actual_score == case.expected_score


def test_partial_credit_type_conversion() -> None:
    """Test that internal enum conversion works correctly."""

    def build_element(
        partial_credit: bool, method: str | None
    ) -> lxml.html.HtmlElement:
        attrs = 'answers-name="test"'
        attrs += f' partial-credit="{partial_credit}"'
        if method:
            attrs += f' partial-credit-method="{method}"'
        return lxml.html.fragment_fromstring(f"<pl-checkbox {attrs}></pl-checkbox>")

    assert (
        pl_checkbox.get_partial_credit_mode(build_element(False, "PC"))
        == pl_checkbox.PartialCreditType.ALL_OR_NOTHING
    )

    assert (
        pl_checkbox.get_partial_credit_mode(build_element(True, "PC"))
        == pl_checkbox.PartialCreditType.NET_CORRECT
    )
    assert (
        pl_checkbox.get_partial_credit_mode(build_element(True, "COV"))
        == pl_checkbox.PartialCreditType.COVERAGE
    )
    assert (
        pl_checkbox.get_partial_credit_mode(build_element(True, "EDC"))
        == pl_checkbox.PartialCreditType.EACH_ANSWER
    )

    with pytest.raises(ValueError, match="Unknown partial_credit_method"):
        pl_checkbox.get_partial_credit_mode(build_element(True, "INVALID"))


def test_order_type_conversion() -> None:
    """Test that internal order type enum conversion works correctly."""
    assert (
        pl_checkbox.get_order_type(
            lxml.html.fragment_fromstring(
                '<pl-checkbox fixed-order="false"></pl-checkbox>'
            )
        )
        == pl_checkbox.OrderType.RANDOM
    )
    assert (
        pl_checkbox.get_order_type(
            lxml.html.fragment_fromstring(
                '<pl-checkbox fixed-order="true"></pl-checkbox>'
            )
        )
        == pl_checkbox.OrderType.FIXED
    )


def test_categorize_options() -> None:
    """Test that categorize_options function works correctly."""
    element_html = """
    <pl-checkbox answers-name="test">
        <pl-answer correct="true">Option A</pl-answer>
        <pl-answer correct="false">Option B</pl-answer>
        <pl-answer correct="true">Option C</pl-answer>
        <pl-answer>Option D</pl-answer>
    </pl-checkbox>
    """
    element = lxml.html.fragment_fromstring(element_html)

    correct, incorrect = pl_checkbox.categorize_options(element)

    assert len(correct) == 2
    assert len(incorrect) == 2
    assert correct[0].html == "Option A"
    assert correct[1].html == "Option C"
    assert incorrect[0].html == "Option B"
    assert incorrect[1].html == "Option D"


class NumberCorrectTestCase(NamedTuple):
    num_correct: int
    show_number_correct: bool
    expected: str
    id: str


# Tests for generate_number_correct_text() function
@pytest.mark.parametrize(
    "case",
    [
        # Show number correct = False
        NumberCorrectTestCase(
            num_correct=5,
            show_number_correct=False,
            expected="",
            id="show_false",
        ),
        NumberCorrectTestCase(
            num_correct=1,
            show_number_correct=True,
            expected=" There is exactly <b>1</b> correct option in the list above.",
            id="show_true_singular",
        ),
        NumberCorrectTestCase(
            num_correct=0,
            show_number_correct=True,
            expected=" There are exactly <b>0</b> correct options in the list above.",
            id="show_true_zero",
        ),
        NumberCorrectTestCase(
            num_correct=2,
            show_number_correct=True,
            expected=" There are exactly <b>2</b> correct options in the list above.",
            id="show_true_two",
        ),
    ],
    ids=lambda case: case.id,
)
def test_generate_number_correct_text(case: NumberCorrectTestCase) -> None:
    """Test the extracted generate_number_correct_text function."""
    result = pl_checkbox.generate_number_correct_text(
        num_correct=case.num_correct,
        show_number_correct=case.show_number_correct,
    )
    assert result == case.expected
