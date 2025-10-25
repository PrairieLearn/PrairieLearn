"""
Backward compatibility tests for pl-checkbox element.

These tests ensure that existing questions using the old API continue to work
exactly as they did before the refactoring.
"""

import importlib
from typing import Any

import lxml.html
import pytest

pl_checkbox = importlib.import_module("pl-checkbox")


@pytest.mark.parametrize(
    ("partial_credit", "partial_credit_method", "expected_type"),
    [
        pytest.param(
            "false",
            None,
            pl_checkbox.PartialCreditType.ALL_OR_NOTHING,
            id="legacy_false",
        ),
        pytest.param(
            "true",
            None,
            pl_checkbox.PartialCreditType.NET_CORRECT,
            id="legacy_true_default",
        ),
        pytest.param(
            "true",
            "PC",
            pl_checkbox.PartialCreditType.NET_CORRECT,
            id="legacy_method_pc",
        ),
        pytest.param(
            "true",
            "COV",
            pl_checkbox.PartialCreditType.COVERAGE,
            id="legacy_method_cov",
        ),
        pytest.param(
            "true",
            "EDC",
            pl_checkbox.PartialCreditType.EACH_ANSWER,
            id="legacy_method_edc",
        ),
        pytest.param(
            None,
            None,
            pl_checkbox.PartialCreditType.NET_CORRECT,
            id="no_attribute_default",
        ),
        pytest.param(
            "net-correct",
            None,
            pl_checkbox.PartialCreditType.NET_CORRECT,
            id="new_net_correct",
        ),
        pytest.param(
            "each-answer",
            None,
            pl_checkbox.PartialCreditType.EACH_ANSWER,
            id="new_each_answer",
        ),
        pytest.param(
            "off",
            None,
            pl_checkbox.PartialCreditType.ALL_OR_NOTHING,
            id="new_off",
        ),
        pytest.param(
            "coverage",
            None,
            pl_checkbox.PartialCreditType.COVERAGE,
            id="new_coverage",
        ),
    ],
)
def test_partial_credit_mappings(
    partial_credit: str | None,
    partial_credit_method: str | None,
    expected_type: Any,
) -> None:
    """Test that partial-credit attributes map to correct enum values."""
    # Build element HTML
    attrs = 'answers-name="test"'
    if partial_credit is not None:
        attrs += f' partial-credit="{partial_credit}"'
    if partial_credit_method is not None:
        attrs += f' partial-credit-method="{partial_credit_method}"'

    element_html = f"<pl-checkbox {attrs}></pl-checkbox>"
    element = lxml.html.fragment_fromstring(element_html)

    result = pl_checkbox.get_partial_credit_mode(element)
    assert result == expected_type


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
    ("partial_credit_attr", "submitted", "correct", "all_params", "expected_score"),
    [
        # ALL_OR_NOTHING tests
        pytest.param(
            'partial-credit="off"',
            ["a", "b"],
            ["a", "b"],
            None,
            1.0,
            id="all_or_nothing_perfect",
        ),
        pytest.param(
            'partial-credit="off"',
            ["a"],
            ["a", "b"],
            None,
            0.0,
            id="all_or_nothing_imperfect",
        ),
        pytest.param(
            'partial-credit="false"',
            ["a"],
            ["a", "b"],
            None,
            0.0,
            id="legacy_false_all_or_nothing",
        ),
        # NET_CORRECT tests
        pytest.param(
            'partial-credit="net-correct"',
            ["a", "b"],
            ["a", "b"],
            None,
            1.0,
            id="net_correct_perfect",
        ),
        pytest.param(
            'partial-credit="net-correct"',
            ["a", "b", "c"],
            ["a", "b"],
            None,
            0.5,
            id="net_correct_partial",
        ),
        pytest.param(
            'partial-credit="net-correct"',
            ["c", "d"],
            ["a", "b"],
            None,
            0.0,
            id="net_correct_negative_to_zero",
        ),
        pytest.param(
            'partial-credit="true"',
            ["a", "b", "c"],
            ["a", "b"],
            None,
            0.5,
            id="legacy_true_behaves_as_net",
        ),
        pytest.param(
            'partial-credit="true" partial-credit-method="PC"',
            ["a", "b", "c"],
            ["a", "b"],
            None,
            0.5,
            id="legacy_method_pc",
        ),
        # EACH_ANSWER tests
        pytest.param(
            'partial-credit="each-answer"',
            ["a", "b"],
            ["a", "b"],
            ["a", "b", "c", "d"],
            1.0,
            id="each_answer_perfect",
        ),
        pytest.param(
            'partial-credit="each-answer"',
            ["a", "c"],
            ["a", "b"],
            ["a", "b", "c", "d"],
            0.5,
            id="each_answer_partial",
        ),
        pytest.param(
            'partial-credit="true" partial-credit-method="EDC"',
            ["a", "c"],
            ["a", "b"],
            ["a", "b", "c", "d"],
            0.5,
            id="legacy_method_edc",
        ),
        # COVERAGE tests
        pytest.param(
            'partial-credit="coverage"',
            ["a", "b"],
            ["a", "b"],
            None,
            1.0,
            id="coverage_perfect",
        ),
        pytest.param(
            'partial-credit="coverage"',
            ["a", "b", "c"],
            ["a", "b"],
            None,
            (2 / 2) * (2 / 3),
            id="coverage_with_guessing_penalty",
        ),
        pytest.param(
            'partial-credit="true" partial-credit-method="COV"',
            ["a", "b", "c"],
            ["a", "b"],
            None,
            (2 / 2) * (2 / 3),
            id="legacy_method_cov",
        ),
    ],
)
def test_grading_logic_backward_compatibility(
    partial_credit_attr: str,
    submitted: list[str],
    correct: list[str],
    all_params: list[str] | None,
    expected_score: float,
) -> None:
    """Test that grading logic produces identical results to master."""
    element_html = (
        f'<pl-checkbox answers-name="test" {partial_credit_attr}></pl-checkbox>'
    )
    data = create_test_data(submitted, correct, all_params)

    pl_checkbox.grade(element_html, data)

    actual_score = data["partial_scores"]["test"]["score"]
    if isinstance(expected_score, float) and expected_score not in [0.0, 1.0]:
        # For fractional scores, allow small floating point differences
        assert abs(actual_score - expected_score) < 0.0001
    else:
        assert actual_score == expected_score
