"""
Tests for refactored pl-checkbox element.

These tests verify that the refactoring (internal enums, extracted functions)
maintains the exact same behavior as the original code.
"""

import importlib
from typing import Any

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


# Tests for generate_help_text() function
@pytest.mark.parametrize(
    ("num_correct", "num_display", "show_num", "detailed", "has_min", "has_max", "min_val", "max_val", "expected"),
    [
        # Basic case - no options specified
        pytest.param(
            2, 5, False, False, False, False, 1, 5,
            '<small class="form-text text-muted">Select all possible options that apply.</small>',
            id="basic_no_options",
        ),
        # Show number correct
        pytest.param(
            1, 5, True, False, False, False, 1, 5,
            '<small class="form-text text-muted">Select all possible options that apply. There is exactly <b>1</b> correct option in the list above.</small>',
            id="show_single_correct",
        ),
        pytest.param(
            3, 5, True, False, False, False, 1, 5,
            '<small class="form-text text-muted">Select all possible options that apply. There are exactly <b>3</b> correct options in the list above.</small>',
            id="show_multiple_correct",
        ),
        # Min select only
        pytest.param(
            3, 5, False, False, True, False, 2, 5,
            '<small class="form-text text-muted">Select  at least <b>2</b> options.</small>',
            id="min_select_only",
        ),
        # Max select only
        pytest.param(
            2, 5, False, False, False, True, 1, 3,
            '<small class="form-text text-muted">Select  at most <b>3</b> options.</small>',
            id="max_select_only",
        ),
        # Min and max different
        pytest.param(
            3, 5, False, False, True, True, 2, 4,
            '<small class="form-text text-muted">Select  between <b>2</b> and <b>4</b> options.</small>',
            id="min_and_max_different",
        ),
        # Min and max same
        pytest.param(
            3, 5, False, False, True, True, 3, 3,
            '<small class="form-text text-muted">Select  exactly <b>3</b> options.</small>',
            id="min_and_max_same",
        ),
        # Detailed help text
        pytest.param(
            3, 5, False, True, False, False, 1, 4,
            '<small class="form-text text-muted">Select  between <b>1</b> and <b>4</b> options.</small>',
            id="detailed_help_different",
        ),
        pytest.param(
            2, 5, False, True, False, False, 2, 2,
            '<small class="form-text text-muted">Select  exactly <b>2</b> options.</small>',
            id="detailed_help_same",
        ),
        # Combined with show number correct
        pytest.param(
            3, 5, True, True, False, False, 2, 4,
            '<small class="form-text text-muted">Select  between <b>2</b> and <b>4</b> options. There are exactly <b>3</b> correct options in the list above.</small>',
            id="detailed_with_show_correct",
        ),
    ],
)
def test_generate_help_text(
    num_correct: int,
    num_display: int,
    show_num: bool,
    detailed: bool,
    has_min: bool,
    has_max: bool,
    min_val: int,
    max_val: int,
    expected: str,
) -> None:
    """Test the extracted generate_help_text function."""
    result = pl_checkbox.generate_help_text(
        num_correct=num_correct,
        num_display_answers=num_display,
        show_number_correct=show_num,
        detailed_help_text=detailed,
        has_min_select_attrib=has_min,
        has_max_select_attrib=has_max,
        min_options_to_select=min_val,
        max_options_to_select=max_val,
    )
    assert result == expected


# Tests for grading logic with OLD API (partial-credit + partial-credit-method)
@pytest.mark.parametrize(
    ("partial_credit", "method", "submitted", "correct", "all_params", "expected_score"),
    [
        # No partial credit
        pytest.param(
            "false", None, ["a", "b"], ["a", "b"], None, 1.0,
            id="no_pc_perfect",
        ),
        pytest.param(
            "false", None, ["a"], ["a", "b"], None, 0.0,
            id="no_pc_imperfect",
        ),
        # PC method (net correct)
        pytest.param(
            "true", "PC", ["a", "b"], ["a", "b"], None, 1.0,
            id="pc_perfect",
        ),
        pytest.param(
            "true", "PC", ["a", "b", "c"], ["a", "b"], None, 0.5,
            id="pc_partial",
        ),
        pytest.param(
            "true", "PC", ["c", "d"], ["a", "b"], None, 0.0,
            id="pc_zero",
        ),
        # EDC method (each answer)
        pytest.param(
            "true", "EDC", ["a", "b"], ["a", "b"], ["a", "b", "c", "d"], 1.0,
            id="edc_perfect",
        ),
        pytest.param(
            "true", "EDC", ["a", "c"], ["a", "b"], ["a", "b", "c", "d"], 0.5,
            id="edc_partial",
        ),
        # COV method (coverage)
        pytest.param(
            "true", "COV", ["a", "b"], ["a", "b"], None, 1.0,
            id="cov_perfect",
        ),
        pytest.param(
            "true", "COV", ["a", "b", "c"], ["a", "b"], None, (2 / 2) * (2 / 3),
            id="cov_guessing_penalty",
        ),
        # Default method (PC)
        pytest.param(
            "true", None, ["a", "b", "c"], ["a", "b"], None, 0.5,
            id="default_method",
        ),
    ],
)
def test_grading_with_old_api(
    partial_credit: str,
    method: str | None,
    submitted: list[str],
    correct: list[str],
    all_params: list[str] | None,
    expected_score: float,
) -> None:
    """Test that grading works correctly with OLD API (boolean partial-credit + method)."""
    attrs = 'answers-name="test"'
    attrs += f' partial-credit="{partial_credit}"'
    if method:
        attrs += f' partial-credit-method="{method}"'

    element_html = f"<pl-checkbox {attrs}></pl-checkbox>"
    data = create_test_data(submitted, correct, all_params)

    pl_checkbox.grade(element_html, data)

    actual_score = data["partial_scores"]["test"]["score"]
    if isinstance(expected_score, float) and expected_score not in [0.0, 1.0]:
        # For fractional scores, allow small floating point differences
        assert abs(actual_score - expected_score) < 0.0001
    else:
        assert actual_score == expected_score


# Test internal enum conversions
def test_partial_credit_type_conversion() -> None:
    """Test that internal enum conversion works correctly."""
    # No partial credit
    assert pl_checkbox._get_partial_credit_type(False, "PC") == pl_checkbox.PartialCreditType.ALL_OR_NOTHING

    # With partial credit
    assert pl_checkbox._get_partial_credit_type(True, "PC") == pl_checkbox.PartialCreditType.NET_CORRECT
    assert pl_checkbox._get_partial_credit_type(True, "COV") == pl_checkbox.PartialCreditType.COVERAGE
    assert pl_checkbox._get_partial_credit_type(True, "EDC") == pl_checkbox.PartialCreditType.EACH_ANSWER

    # Invalid method
    with pytest.raises(ValueError, match="Unknown partial_credit_method"):
        pl_checkbox._get_partial_credit_type(True, "INVALID")


def test_order_type_conversion() -> None:
    """Test that internal order type enum conversion works correctly."""
    assert pl_checkbox._get_order_type(False) == pl_checkbox.OrderType.RANDOM
    assert pl_checkbox._get_order_type(True) == pl_checkbox.OrderType.FIXED


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
