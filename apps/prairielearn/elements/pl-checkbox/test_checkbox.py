"""
These tests verify that the refactoring from #13324
has backwards compatibility with the original element.
"""

import importlib
import math
from typing import Any, NamedTuple

import lxml.html
import pytest

pl_checkbox = importlib.import_module("pl-checkbox")

DisplayType = pl_checkbox.DisplayType
OrderType = pl_checkbox.OrderType


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
        assert math.isclose(actual_score, case.expected_score)
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
        == pl_checkbox.PartialCreditType.OFF
    )

    assert (
        pl_checkbox.get_partial_credit_mode(build_element(False, None))
        == pl_checkbox.PartialCreditType.OFF
    )

    assert (
        pl_checkbox.get_partial_credit_mode(build_element(True, None))
        == pl_checkbox.PartialCreditType.NET_CORRECT
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

    # Invalid method with old-style partial-credit="true" - the ValueError from invalid method
    # is caught and falls through to new-style parsing, which then errors on partial-credit-method being set
    with pytest.raises(ValueError, match=r"You cannot set partial-credit-method"):
        pl_checkbox.get_partial_credit_mode(build_element(True, "INVALID"))


def test_partial_credit_default() -> None:
    """Test that default partial credit mode is OFF when no attributes specified."""
    element = lxml.html.fragment_fromstring(
        '<pl-checkbox answers-name="test"></pl-checkbox>'
    )
    assert (
        pl_checkbox.get_partial_credit_mode(element)
        == pl_checkbox.PartialCreditType.OFF
    )


def test_partial_credit_method_without_partial_credit() -> None:
    """Test that partial-credit-method is ignored when partial-credit is not set."""
    element = lxml.html.fragment_fromstring(
        '<pl-checkbox answers-name="test" partial-credit-method="COV"></pl-checkbox>'
    )
    # partial-credit-method without partial-credit is silently ignored, returns default
    assert (
        pl_checkbox.get_partial_credit_mode(element)
        == pl_checkbox.PartialCreditType.OFF
    )


def test_partial_credit_new() -> None:
    """Test that internal enum conversion works correctly."""

    def build_element(partial_credit_type: str) -> lxml.html.HtmlElement:
        attrs = 'answers-name="test"'
        attrs += f' partial-credit="{partial_credit_type}"'
        return lxml.html.fragment_fromstring(f"<pl-checkbox {attrs}></pl-checkbox>")

    assert (
        pl_checkbox.get_partial_credit_mode(build_element("off"))
        == pl_checkbox.PartialCreditType.OFF
    )

    assert (
        pl_checkbox.get_partial_credit_mode(build_element("net-correct"))
        == pl_checkbox.PartialCreditType.NET_CORRECT
    )
    assert (
        pl_checkbox.get_partial_credit_mode(build_element("coverage"))
        == pl_checkbox.PartialCreditType.COVERAGE
    )
    assert (
        pl_checkbox.get_partial_credit_mode(build_element("each-answer"))
        == pl_checkbox.PartialCreditType.EACH_ANSWER
    )

    with pytest.raises(ValueError, match=r"Invalid partial-credit value.*"):
        pl_checkbox.get_partial_credit_mode(build_element("other"))


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


# Backward Compatibility Tests for Attribute Functions


class DisplayTypeTestCase(NamedTuple):
    html_attrs: str
    expected_display_type: DisplayType
    should_raise_error: bool
    id: str


@pytest.mark.parametrize(
    "case",
    [
        # Test new display attribute
        DisplayTypeTestCase(
            html_attrs='display="block"',
            expected_display_type=DisplayType.BLOCK,
            should_raise_error=False,
            id="new_display_block",
        ),
        DisplayTypeTestCase(
            html_attrs='display="inline"',
            expected_display_type=DisplayType.INLINE,
            should_raise_error=False,
            id="new_display_inline",
        ),
        # Test deprecated inline attribute (backward compatibility)
        DisplayTypeTestCase(
            html_attrs='inline="true"',
            expected_display_type=DisplayType.INLINE,
            should_raise_error=False,
            id="deprecated_inline_true",
        ),
        DisplayTypeTestCase(
            html_attrs='inline="false"',
            expected_display_type=DisplayType.BLOCK,
            should_raise_error=False,
            id="deprecated_inline_false",
        ),
        DisplayTypeTestCase(
            html_attrs="",  # No attributes - should default to block
            expected_display_type=DisplayType.BLOCK,
            should_raise_error=False,
            id="no_attributes_default",
        ),
        # Test error condition: both inline and display attributes set
        DisplayTypeTestCase(
            html_attrs='inline="true" display="block"',
            expected_display_type=DisplayType.BLOCK,  # Not used due to error
            should_raise_error=True,
            id="both_inline_and_display_error",
        ),
    ],
)
def test_get_display_type_backward_compatibility(case: DisplayTypeTestCase) -> None:
    """Test get_display_type function for backward compatibility with inline attribute."""
    html_content = f"<pl-checkbox {case.html_attrs}></pl-checkbox>"
    element = lxml.html.fragment_fromstring(html_content)

    if case.should_raise_error:
        with pytest.raises(
            ValueError,
            match="Cannot set both 'display' and 'inline' attributes",
        ):
            pl_checkbox.get_display_type(element)
    else:
        result = pl_checkbox.get_display_type(element)
        assert result == case.expected_display_type


class OrderTypeTestCase(NamedTuple):
    html_attrs: str
    expected_order_type: OrderType
    should_raise_error: bool
    id: str


@pytest.mark.parametrize(
    "case",
    [
        # Test new order attribute
        OrderTypeTestCase(
            html_attrs='order="fixed"',
            expected_order_type=OrderType.FIXED,
            should_raise_error=False,
            id="new_order_fixed",
        ),
        OrderTypeTestCase(
            html_attrs='order="random"',
            expected_order_type=OrderType.RANDOM,
            should_raise_error=False,
            id="new_order_random",
        ),
        # Test deprecated fixed-order attribute (backward compatibility)
        OrderTypeTestCase(
            html_attrs='fixed-order="true"',
            expected_order_type=OrderType.FIXED,
            should_raise_error=False,
            id="deprecated_fixed_order_true",
        ),
        OrderTypeTestCase(
            html_attrs='fixed-order="false"',
            expected_order_type=OrderType.RANDOM,
            should_raise_error=False,
            id="deprecated_fixed_order_false",
        ),
        OrderTypeTestCase(
            html_attrs="",  # No attributes - should default to random
            expected_order_type=OrderType.RANDOM,
            should_raise_error=False,
            id="no_attributes_default",
        ),
        # Test error condition: both fixed-order and order attributes set
        OrderTypeTestCase(
            html_attrs='fixed-order="true" order="random"',
            expected_order_type=OrderType.RANDOM,  # Not used due to error
            should_raise_error=True,
            id="both_fixed_order_and_order_error",
        ),
    ],
)
def test_get_order_type_backward_compatibility(case: OrderTypeTestCase) -> None:
    """Test get_order_type function for backward compatibility with fixed-order attribute."""
    html_content = f"<pl-checkbox {case.html_attrs}></pl-checkbox>"
    element = lxml.html.fragment_fromstring(html_content)

    if case.should_raise_error:
        with pytest.raises(
            ValueError,
            match='Setting answer choice order should be done with the "order" attribute',
        ):
            pl_checkbox.get_order_type(element)
    else:
        result = pl_checkbox.get_order_type(element)
        assert result == case.expected_order_type


def test_grade_with_duplicate_submissions() -> None:
    """Test grading behavior when submitted answers contain duplicates."""
    # Test that duplicates in submitted answers are handled correctly via set()
    data = create_test_data(
        submitted=["a", "b", "b", "c"],  # Duplicate 'b'
        correct=["a", "b", "c"],
        all_params=["a", "b", "c", "d"],
    )

    element_html = '<pl-checkbox answers-name="test"></pl-checkbox>'

    pl_checkbox.grade(element_html, data)

    # With duplicates, set(['a', 'b', 'b', 'c']) == set(['a', 'b', 'c'])
    # So it should be treated as selecting a, b, c (all correct)
    assert data["partial_scores"]["test"]["score"] == pytest.approx(1.0)


def test_grade_with_duplicate_submissions_partial_credit() -> None:
    """Test partial credit grading with duplicate submissions."""
    # Test NET_CORRECT (PC) mode with duplicates
    data = create_test_data(
        submitted=["a", "a", "b"],  # Duplicate 'a', missing 'c'
        correct=["a", "b", "c"],
        all_params=["a", "b", "c", "d"],
    )

    element_html = (
        '<pl-checkbox answers-name="test" partial-credit="net-correct"></pl-checkbox>'
    )

    pl_checkbox.grade(element_html, data)

    # set(['a', 'a', 'b']) == set(['a', 'b'])
    # t = 2 (correct answers selected: a, b)
    # f = 0 (incorrect answers selected: none)
    # n = 3 (total correct answers: a, b, c)
    # score = max(0, (2 - 0) / 3) = 2/3 ≈ 0.6667
    assert math.isclose(data["partial_scores"]["test"]["score"], 2 / 3, rel_tol=1e-9)


def test_grade_with_duplicate_correct_answers() -> None:
    """Test that grading correctly handles when correct_answers has duplicates.

    This tests the edge case where the data structure itself might contain
    duplicate keys in correct_answers, which would be unusual but should be
    handled gracefully by the set() conversion.
    """
    # Manually create data with duplicate correct answer keys
    data = {
        "submitted_answers": {"test": ["a", "b"]},
        "correct_answers": {
            "test": [{"key": "a"}, {"key": "b"}, {"key": "b"}]
        },  # Duplicate 'b'
        "params": {"test": [{"key": "a"}, {"key": "b"}, {"key": "c"}]},
        "partial_scores": {},
    }

    element_html = '<pl-checkbox answers-name="test"></pl-checkbox>'

    pl_checkbox.grade(element_html, data)

    # Even with duplicate 'b' in correct_answers, set() should handle it
    # Submitted: {a, b}, Correct: {a, b} (after set conversion)
    assert data["partial_scores"]["test"]["score"] == pytest.approx(1.0)  # type: ignore[reportCallIssue, reportArgumentType]


def test_grade_coverage_with_duplicates() -> None:
    """Test COV grading mode with duplicate submissions."""
    data = create_test_data(
        submitted=["a", "b", "b", "d"],  # Duplicate 'b', one incorrect 'd'
        correct=["a", "b", "c"],
        all_params=["a", "b", "c", "d"],
    )

    element_html = (
        '<pl-checkbox answers-name="test" partial-credit="coverage"></pl-checkbox>'
    )

    pl_checkbox.grade(element_html, data)

    # set(['a', 'b', 'b', 'd']) == set(['a', 'b', 'd'])
    # t = 2 (correct answers in submitted: a, b)
    # c = 3 (total correct: a, b, c)
    # n = 3 (total submitted after set: a, b, d)
    # score = (2/3) * (2/3) = 4/9 ≈ 0.4444
    assert math.isclose(data["partial_scores"]["test"]["score"], 4 / 9, rel_tol=1e-9)


def test_max_correct_respected_without_number_answers() -> None:
    """Test that max-correct is respected when number-answers is not specified.

    Regression test for https://github.com/PrairieLearn/PrairieLearn/issues/4430

    When max-correct is specified but number-answers is not, the element should
    adjust number-answers to ensure at most max-correct correct answers are shown.
    Previously, all answers would be shown, which could force more correct answers
    than max-correct allows.
    """
    # Build an element with 5 correct and 4 incorrect options
    # max-correct=4 means at most 4 correct should be shown
    element_html = """
    <pl-checkbox answers-name="ans" min-correct="2" max-correct="4">
        <pl-answer correct="true">Correct 1</pl-answer>
        <pl-answer correct="true">Correct 2</pl-answer>
        <pl-answer correct="true">Correct 3</pl-answer>
        <pl-answer correct="true">Correct 4</pl-answer>
        <pl-answer correct="true">Correct 5</pl-answer>
        <pl-answer>Incorrect 1</pl-answer>
        <pl-answer>Incorrect 2</pl-answer>
        <pl-answer>Incorrect 3</pl-answer>
        <pl-answer>Incorrect 4</pl-answer>
    </pl-checkbox>
    """

    data: dict[str, Any] = {
        "params": {},
        "correct_answers": {},
        "submitted_answers": {},
        "format_errors": {},
        "partial_scores": {},
        "score": 0,
        "feedback": {},
        "variant_seed": "12345",
        "options": {},
        "raw_submitted_answers": {},
        "editable": True,
        "panel": "question",
        "extensions": {},
        "num_valid_submissions": 0,
        "manual_points": 0,
        "auto_points": 0,
        "answers_names": {},
    }

    # Run prepare multiple times to check that max-correct is always respected
    for _ in range(10):
        # Reset data for each run
        data["params"] = {}
        data["correct_answers"] = {}
        data["answers_names"] = {}

        pl_checkbox.prepare(element_html, data)

        # Count how many correct answers were selected
        correct_answer_list = data["correct_answers"]["ans"]
        num_correct = len(correct_answer_list)

        # The bug would cause 5 correct answers to be shown
        # The fix ensures at most 4 are shown
        assert num_correct <= 4, (
            f"max-correct=4 was specified but {num_correct} correct answers were shown. "
            "This is the bug from issue #4430."
        )
        assert num_correct >= 2, (
            f"min-correct=2 was specified but only {num_correct} correct answers were shown."
        )
