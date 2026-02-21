import importlib
import json

import pytest

pl_drawing = importlib.import_module("pl-drawing")


def build_element_html(
    answers_name: str = "test",
    gradable: bool = True,
    weight: int | None = None,
    allow_blank: bool | None = None,
    show_score: bool | None = None,
) -> str:
    """Build a minimal pl-drawing element HTML string for testing."""
    attrs = [f'answers-name="{answers_name}"', f'gradable="{str(gradable).lower()}"']
    if weight is not None:
        attrs.append(f'weight="{weight}"')
    if allow_blank is not None:
        attrs.append(f'allow-blank="{str(allow_blank).lower()}"')
    if show_score is not None:
        attrs.append(f'show-score="{str(show_score).lower()}"')

    return f"""<pl-drawing {" ".join(attrs)}>
        <pl-drawing-answer>
            <pl-point x1="100" y1="100"></pl-point>
        </pl-drawing-answer>
    </pl-drawing>"""


def make_question_data(
    submitted_answers: dict | None = None,
    correct_answers: dict | None = None,
    format_errors: dict | None = None,
    partial_scores: dict | None = None,
) -> dict:
    """Create a mock QuestionData dict for testing."""
    return {
        "submitted_answers": submitted_answers or {},
        "correct_answers": correct_answers or {},
        "format_errors": format_errors or {},
        "partial_scores": partial_scores or {},
        "extensions": {},  # Required by load_extensions()
    }


# =============================================================================
# Tests for weight validation
# =============================================================================


def test_weight_validation_negative_raises_error() -> None:
    """Negative weight should raise ValueError."""
    element_html = build_element_html(weight=-1)
    data = make_question_data()

    with pytest.raises(ValueError, match="non-negative integer"):
        pl_drawing.prepare(element_html, data)


def test_weight_validation_zero_is_valid() -> None:
    """Zero weight should be valid (no error)."""
    element_html = build_element_html(weight=0)
    data = make_question_data()

    # Should not raise - prepare needs more setup to fully work,
    # but weight validation happens early
    try:
        pl_drawing.prepare(element_html, data)
    except ValueError as e:
        if "non-negative" in str(e):
            pytest.fail("weight=0 should be valid")
        # Other errors are OK (missing answer elements, etc.)


def test_weight_validation_positive_is_valid() -> None:
    """Positive weight should be valid."""
    element_html = build_element_html(weight=5)
    data = make_question_data()

    try:
        pl_drawing.prepare(element_html, data)
    except ValueError as e:
        if "non-negative" in str(e):
            pytest.fail("weight=5 should be valid")


# =============================================================================
# Tests for parse() with allow-blank
# =============================================================================


def test_parse_blank_submission_without_allow_blank_sets_error() -> None:
    """Without allow-blank, empty submission should set format error."""
    element_html = build_element_html(allow_blank=False)
    data = make_question_data(submitted_answers={"test": "[]"})

    pl_drawing.parse(element_html, data)

    assert "test" in data["format_errors"]
    assert data["submitted_answers"]["test"] is None


def test_parse_blank_submission_with_allow_blank_no_error() -> None:
    """With allow-blank=true, empty submission should NOT set format error."""
    element_html = build_element_html(allow_blank=True)
    data = make_question_data(submitted_answers={"test": "[]"})

    pl_drawing.parse(element_html, data)

    assert "test" not in data["format_errors"]


def test_parse_none_submission_with_allow_blank_no_error() -> None:
    """With allow-blank=true, None submission should NOT set format error."""
    element_html = build_element_html(allow_blank=True)
    data = make_question_data(submitted_answers={})  # No "test" key

    pl_drawing.parse(element_html, data)

    assert "test" not in data["format_errors"]


def test_parse_valid_submission_works_with_allow_blank() -> None:
    """Valid submission should parse correctly regardless of allow-blank."""
    element_html = build_element_html(allow_blank=True)
    valid_answer = [{"id": 1, "type": "pl-point", "x1": 100, "y1": 100}]
    data = make_question_data(submitted_answers={"test": json.dumps(valid_answer)})

    pl_drawing.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert data["submitted_answers"]["test"] == valid_answer


# =============================================================================
# Tests for grade() with allow-blank and weight
# =============================================================================


def test_grade_blank_submission_without_allow_blank_sets_error() -> None:
    """Without allow-blank, blank submission in grade() should set format error."""
    element_html = build_element_html(allow_blank=False)
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": []},
    )

    pl_drawing.grade(element_html, data)

    assert "test" in data["format_errors"]
    assert "test" not in data["partial_scores"]


def test_grade_blank_submission_with_allow_blank_scores_zero() -> None:
    """With allow-blank=true, blank submission should score 0, not error."""
    element_html = build_element_html(allow_blank=True)
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": []},
    )

    pl_drawing.grade(element_html, data)

    assert "test" not in data["format_errors"]
    assert "test" in data["partial_scores"]
    assert data["partial_scores"]["test"]["score"] == 0.0


def test_grade_blank_submission_with_allow_blank_uses_weight() -> None:
    """With allow-blank=true, blank submission should use specified weight."""
    element_html = build_element_html(allow_blank=True, weight=5)
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": []},
    )

    pl_drawing.grade(element_html, data)

    assert data["partial_scores"]["test"]["weight"] == 5


def test_grade_blank_submission_with_allow_blank_feedback_structure() -> None:
    """With allow-blank=true, blank submission feedback should have correct structure."""
    element_html = build_element_html(allow_blank=True)
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": []},
    )

    pl_drawing.grade(element_html, data)

    feedback = data["partial_scores"]["test"]["feedback"]
    assert feedback["correct"] is False
    assert feedback["partial"] is False
    assert feedback["incorrect"] is True
    assert "missing" in feedback
    assert "matches" in feedback


def test_grade_uses_custom_weight() -> None:
    """Grade should use the custom weight from the element."""
    element_html = build_element_html(weight=3, allow_blank=True)
    data = make_question_data(
        submitted_answers={"test": []},
        correct_answers={"test": []},
    )

    pl_drawing.grade(element_html, data)

    assert data["partial_scores"]["test"]["weight"] == 3


def test_grade_default_weight_is_one() -> None:
    """Grade should default to weight=1 when not specified."""
    element_html = build_element_html(allow_blank=True)
    data = make_question_data(
        submitted_answers={"test": []},
        correct_answers={"test": []},
    )

    pl_drawing.grade(element_html, data)

    assert data["partial_scores"]["test"]["weight"] == 1


# =============================================================================
# Tests for submissions with only non-graded initial objects
# =============================================================================


def test_grade_only_initial_objects_without_allow_blank_sets_error() -> None:
    """Submission with only non-graded initial objects should be treated as blank.

    When a user interacts with the canvas (e.g., adds then removes an element),
    the submission may contain initial objects with graded=False but no
    student-placed graded objects. This should be treated as a blank submission.
    """
    element_html = build_element_html(allow_blank=False)
    # Simulate submission with only initial (non-graded) objects
    initial_objects = [
        {
            "id": 0,
            "type": "pl-rectangle",
            "gradingName": "pl-rectangle",
            "graded": False,  # Initial object, not graded
            "left": 100,
            "top": 100,
            "width": 50,
            "height": 50,
        }
    ]
    # Reference answer expects a graded point
    reference = [
        {
            "id": 0,
            "type": "pl-point",
            "gradingName": "pl-point",
            "graded": True,
            "x1": 100,
            "y1": 100,
        }
    ]
    data = make_question_data(
        submitted_answers={"test": initial_objects},
        correct_answers={"test": reference},
    )

    pl_drawing.grade(element_html, data)

    assert "test" in data["format_errors"]
    assert "test" not in data["partial_scores"]


def test_grade_only_initial_objects_with_allow_blank_scores_zero() -> None:
    """With allow-blank=true, submission with only initial objects should score 0."""
    element_html = build_element_html(allow_blank=True)
    # Simulate submission with only initial (non-graded) objects
    initial_objects = [
        {
            "id": 0,
            "type": "pl-rectangle",
            "gradingName": "pl-rectangle",
            "graded": False,  # Initial object, not graded
            "left": 100,
            "top": 100,
            "width": 50,
            "height": 50,
        }
    ]
    # Reference answer expects a graded point
    reference = [
        {
            "id": 0,
            "type": "pl-point",
            "gradingName": "pl-point",
            "graded": True,
            "x1": 100,
            "y1": 100,
        }
    ]
    data = make_question_data(
        submitted_answers={"test": initial_objects},
        correct_answers={"test": reference},
    )

    pl_drawing.grade(element_html, data)

    assert "test" not in data["format_errors"]
    assert "test" in data["partial_scores"]
    assert data["partial_scores"]["test"]["score"] == 0.0
