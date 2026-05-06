import importlib
from typing import Any

import pytest

pl_multiple_choice = importlib.import_module("pl-multiple-choice")

prepare_answers_to_display = pl_multiple_choice.prepare_answers_to_display
AotaNotaType = pl_multiple_choice.AotaNotaType
OrderType = pl_multiple_choice.OrderType
DisplayType = pl_multiple_choice.DisplayType
AnswerTuple = pl_multiple_choice.AnswerTuple

NO_CORRECT_ELEMENT_HTML = """
<pl-multiple-choice answers-name="survey" builtin-grading="false" order="fixed">
  <pl-answer>Option A</pl-answer>
  <pl-answer>Option B</pl-answer>
  <pl-answer>Option C</pl-answer>
  <pl-answer>Option D</pl-answer>
</pl-multiple-choice>
"""

NO_CORRECT_DEFAULT_ELEMENT_HTML = """
<pl-multiple-choice answers-name="survey" order="fixed">
  <pl-answer>Option A</pl-answer>
  <pl-answer>Option B</pl-answer>
  <pl-answer>Option C</pl-answer>
  <pl-answer>Option D</pl-answer>
</pl-multiple-choice>
"""


def _make_question_data() -> dict[str, Any]:
    return {
        "params": {},
        "correct_answers": {},
        "submitted_answers": {},
        "format_errors": {},
        "partial_scores": {},
        "feedback": {},
        "raw_submitted_answers": {},
        "options": {"question_path": "."},
    }


def make_answers(
    correct: list[str], incorrect: list[str]
) -> tuple[list[Any], list[Any]]:
    """Helper to create correct and incorrect AnswerTuple lists."""
    idx = 0
    correct_answers = []
    for text in correct:
        correct_answers.append(AnswerTuple(idx, True, text, None, None))
        idx += 1
    incorrect_answers = []
    for text in incorrect:
        incorrect_answers.append(AnswerTuple(idx, False, text, None, None))
        idx += 1
    return correct_answers, incorrect_answers


def _prepare_with_defaults(
    correct: list[str],
    incorrect: list[str],
    *,
    builtin_grading: bool = True,
) -> list[Any]:
    correct_answers, incorrect_answers = make_answers(correct, incorrect)
    return prepare_answers_to_display(
        correct_answers,
        incorrect_answers,
        number_answers=None,
        aota=AotaNotaType.FALSE,
        nota=AotaNotaType.FALSE,
        aota_feedback=None,
        nota_feedback=None,
        order_type=OrderType.FIXED,
        display_type=DisplayType.BLOCK,
        builtin_grading=builtin_grading,
    )


def test_no_correct_answers_raises_with_builtin_grading() -> None:
    """Test that the default (builtin_grading=True) requires at least one correct answer."""
    with pytest.raises(ValueError, match="at least 1 correct answer"):
        _prepare_with_defaults([], ["A", "B", "C"])


def test_no_correct_answers_allowed_without_builtin_grading() -> None:
    """Test that builtin_grading=False allows zero correct answers."""
    result = _prepare_with_defaults([], ["A", "B", "C"], builtin_grading=False)
    assert len(result) == 3
    assert all(not a.correct for a in result)


def test_builtin_grading_false_with_correct_answers_still_works() -> None:
    """Test that builtin_grading=False still works when correct answers are present."""
    result = _prepare_with_defaults(["A"], ["B", "C"], builtin_grading=False)
    assert len(result) == 3
    assert sum(1 for a in result if a.correct) == 1


def test_builtin_grading_true_is_default_behavior() -> None:
    """Test that explicit builtin_grading=True matches the default validation."""
    with pytest.raises(ValueError, match="at least 1 correct answer"):
        _prepare_with_defaults([], ["A", "B"], builtin_grading=True)


def test_prepare_no_correct_answers_from_html() -> None:
    """Test that prepare() succeeds with builtin-grading='false' and no correct answers."""
    data = _make_question_data()
    pl_multiple_choice.prepare(NO_CORRECT_ELEMENT_HTML, data)

    assert len(data["params"]["survey"]) == 4
    assert data["correct_answers"]["survey"] is None


def test_prepare_no_correct_answers_default_raises() -> None:
    """Test that prepare() raises without builtin-grading when no correct answers exist."""
    data = _make_question_data()
    with pytest.raises(ValueError, match="at least 1 correct answer"):
        pl_multiple_choice.prepare(NO_CORRECT_DEFAULT_ELEMENT_HTML, data)


def test_grade_skipped_when_builtin_grading_false() -> None:
    """Test that grade() is a no-op when builtin-grading='false'."""
    data = _make_question_data()
    pl_multiple_choice.prepare(NO_CORRECT_ELEMENT_HTML, data)
    data["submitted_answers"]["survey"] = "a"

    pl_multiple_choice.grade(NO_CORRECT_ELEMENT_HTML, data)

    assert "survey" not in data["partial_scores"]


def test_render_answer_panel_empty_when_no_correct() -> None:
    """Test that the answer panel renders empty when no correct answer exists."""
    data = _make_question_data()
    pl_multiple_choice.prepare(NO_CORRECT_ELEMENT_HTML, data)
    data["panel"] = "answer"
    data["editable"] = False

    result = pl_multiple_choice.render(NO_CORRECT_ELEMENT_HTML, data)

    assert result == ""


def test_test_skipped_when_builtin_grading_false() -> None:
    """Test that test() is a no-op when builtin-grading='false'."""
    data = _make_question_data()
    pl_multiple_choice.prepare(NO_CORRECT_ELEMENT_HTML, data)
    data["test_type"] = "correct"

    pl_multiple_choice.test(NO_CORRECT_ELEMENT_HTML, data)

    assert "survey" not in data["raw_submitted_answers"]
    assert "survey" not in data["partial_scores"]
