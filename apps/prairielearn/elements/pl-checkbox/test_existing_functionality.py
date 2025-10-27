"""
Tests for existing pl-checkbox functionality (no new features).

These tests verify the current behavior of pl-checkbox element
on the master branch, providing a safety net for refactoring.
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


@pytest.mark.parametrize(
    ("partial_credit", "partial_credit_method", "submitted", "correct", "all_params", "expected_score"),
    [
        # No partial credit (default: false)
        pytest.param(
            "false",
            None,
            ["a", "b"],
            ["a", "b"],
            None,
            1.0,
            id="no_partial_credit_perfect",
        ),
        pytest.param(
            "false",
            None,
            ["a"],
            ["a", "b"],
            None,
            0.0,
            id="no_partial_credit_imperfect",
        ),
        # Partial credit with method PC (net correct)
        pytest.param(
            "true",
            "PC",
            ["a", "b"],
            ["a", "b"],
            None,
            1.0,
            id="pc_perfect",
        ),
        pytest.param(
            "true",
            "PC",
            ["a", "b", "c"],
            ["a", "b"],
            None,
            0.5,
            id="pc_partial",
        ),
        pytest.param(
            "true",
            "PC",
            ["c", "d"],
            ["a", "b"],
            None,
            0.0,
            id="pc_negative_to_zero",
        ),
        # Partial credit with method EDC (each answer)
        pytest.param(
            "true",
            "EDC",
            ["a", "b"],
            ["a", "b"],
            ["a", "b", "c", "d"],
            1.0,
            id="edc_perfect",
        ),
        pytest.param(
            "true",
            "EDC",
            ["a", "c"],
            ["a", "b"],
            ["a", "b", "c", "d"],
            0.5,
            id="edc_partial",
        ),
        # Partial credit with method COV (coverage)
        pytest.param(
            "true",
            "COV",
            ["a", "b"],
            ["a", "b"],
            None,
            1.0,
            id="cov_perfect",
        ),
        pytest.param(
            "true",
            "COV",
            ["a", "b", "c"],
            ["a", "b"],
            None,
            (2 / 2) * (2 / 3),
            id="cov_with_guessing_penalty",
        ),
        # Partial credit true without method (defaults to PC)
        pytest.param(
            "true",
            None,
            ["a", "b", "c"],
            ["a", "b"],
            None,
            0.5,
            id="partial_credit_default_method",
        ),
    ],
)
def test_existing_grading_logic(
    partial_credit: str,
    partial_credit_method: str | None,
    submitted: list[str],
    correct: list[str],
    all_params: list[str] | None,
    expected_score: float,
) -> None:
    """Test that grading logic works correctly with existing attributes."""
    attrs = 'answers-name="test"'
    attrs += f' partial-credit="{partial_credit}"'
    if partial_credit_method:
        attrs += f' partial-credit-method="{partial_credit_method}"'

    element_html = f"<pl-checkbox {attrs}></pl-checkbox>"
    data = create_test_data(submitted, correct, all_params)

    pl_checkbox.grade(element_html, data)

    actual_score = data["partial_scores"]["test"]["score"]
    if isinstance(expected_score, float) and expected_score not in [0.0, 1.0]:
        # For fractional scores, allow small floating point differences
        assert abs(actual_score - expected_score) < 0.0001
    else:
        assert actual_score == expected_score
