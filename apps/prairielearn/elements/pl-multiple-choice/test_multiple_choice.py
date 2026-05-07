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

WEIGHT_WITH_NO_BUILTIN_GRADING_HTML = """
<pl-multiple-choice answers-name="survey" builtin-grading="false" weight="2" order="fixed">
  <pl-answer>Option A</pl-answer>
  <pl-answer>Option B</pl-answer>
</pl-multiple-choice>
"""

AOTA_WITH_NO_BUILTIN_GRADING_HTML = """
<pl-multiple-choice answers-name="survey" builtin-grading="false" all-of-the-above="random" order="fixed">
  <pl-answer correct="true">Option A</pl-answer>
  <pl-answer correct="true">Option B</pl-answer>
</pl-multiple-choice>
"""

NOTA_WITH_NO_BUILTIN_GRADING_HTML = """
<pl-multiple-choice answers-name="survey" builtin-grading="false" none-of-the-above="random" order="fixed">
  <pl-answer correct="true">Option A</pl-answer>
  <pl-answer>Option B</pl-answer>
</pl-multiple-choice>
"""

HIDE_SCORE_BADGE_WITH_NO_BUILTIN_GRADING_HTML = """
<pl-multiple-choice answers-name="survey" builtin-grading="false" hide-score-badge="true" order="fixed">
  <pl-answer>Option A</pl-answer>
  <pl-answer>Option B</pl-answer>
</pl-multiple-choice>
"""

SCORE_ON_ANSWER_WITH_NO_BUILTIN_GRADING_HTML = """
<pl-multiple-choice answers-name="survey" builtin-grading="false" order="fixed">
  <pl-answer score="0.5">Option A</pl-answer>
  <pl-answer>Option B</pl-answer>
</pl-multiple-choice>
"""

FEEDBACK_ON_ANSWER_WITH_NO_BUILTIN_GRADING_HTML = """
<pl-multiple-choice answers-name="survey" builtin-grading="false" order="fixed">
  <pl-answer feedback="Nice try">Option A</pl-answer>
  <pl-answer>Option B</pl-answer>
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
    number_answers: int | None = None,
) -> list[Any]:
    correct_answers, incorrect_answers = make_answers(correct, incorrect)
    return prepare_answers_to_display(
        correct_answers,
        incorrect_answers,
        number_answers=number_answers,
        aota=AotaNotaType.FALSE,
        nota=AotaNotaType.FALSE,
        aota_feedback=None,
        nota_feedback=None,
        order_type=OrderType.FIXED,
        display_type=DisplayType.BLOCK,
        builtin_grading=builtin_grading,
    )


def test_zero_answers_raises() -> None:
    """Test that at least 1 answer choice is required regardless of builtin_grading."""
    with pytest.raises(ValueError, match="at least 1 answer choice"):
        _prepare_with_defaults([], [])
    with pytest.raises(ValueError, match="at least 1 answer choice"):
        _prepare_with_defaults([], [], builtin_grading=False)


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


def test_number_answers_exceeding_total_with_no_correct() -> None:
    """Test that number-answers larger than available answers doesn't cause INTERNAL ERROR."""
    result = _prepare_with_defaults(
        [], ["A", "B", "C"], builtin_grading=False, number_answers=4
    )
    assert len(result) == 3


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


def test_prepare_rejects_weight_with_no_builtin_grading() -> None:
    """Test that prepare() raises when weight is set alongside builtin-grading='false'."""
    data = _make_question_data()
    with pytest.raises(ValueError, match=r"weight.*should not be set"):
        pl_multiple_choice.prepare(WEIGHT_WITH_NO_BUILTIN_GRADING_HTML, data)


def test_prepare_rejects_aota_with_no_builtin_grading() -> None:
    """Test that prepare() raises when all-of-the-above is set alongside builtin-grading='false'."""
    data = _make_question_data()
    with pytest.raises(ValueError, match=r"all-of-the-above.*should not be set"):
        pl_multiple_choice.prepare(AOTA_WITH_NO_BUILTIN_GRADING_HTML, data)


def test_prepare_rejects_nota_with_no_builtin_grading() -> None:
    """Test that prepare() raises when none-of-the-above is set alongside builtin-grading='false'."""
    data = _make_question_data()
    with pytest.raises(ValueError, match=r"none-of-the-above.*should not be set"):
        pl_multiple_choice.prepare(NOTA_WITH_NO_BUILTIN_GRADING_HTML, data)


def test_prepare_rejects_hide_score_badge_with_no_builtin_grading() -> None:
    """Test that prepare() raises when hide-score-badge is set alongside builtin-grading='false'."""
    data = _make_question_data()
    with pytest.raises(ValueError, match=r"hide-score-badge.*should not be set"):
        pl_multiple_choice.prepare(HIDE_SCORE_BADGE_WITH_NO_BUILTIN_GRADING_HTML, data)


def test_prepare_rejects_score_on_answer_with_no_builtin_grading() -> None:
    """Test that prepare() raises when score is set on pl-answer alongside builtin-grading='false'."""
    data = _make_question_data()
    with pytest.raises(ValueError, match=r"score.*should not be set"):
        pl_multiple_choice.prepare(SCORE_ON_ANSWER_WITH_NO_BUILTIN_GRADING_HTML, data)


def test_prepare_rejects_feedback_on_answer_with_no_builtin_grading() -> None:
    """Test that prepare() raises when feedback is set on pl-answer alongside builtin-grading='false'."""
    data = _make_question_data()
    with pytest.raises(ValueError, match=r"feedback.*should not be set"):
        pl_multiple_choice.prepare(
            FEEDBACK_ON_ANSWER_WITH_NO_BUILTIN_GRADING_HTML, data
        )


def test_grade_skipped_when_builtin_grading_false() -> None:
    """Test that grade() is a no-op when builtin-grading='false'."""
    data = _make_question_data()
    pl_multiple_choice.prepare(NO_CORRECT_ELEMENT_HTML, data)
    data["submitted_answers"]["survey"] = "a"

    pl_multiple_choice.grade(NO_CORRECT_ELEMENT_HTML, data)

    assert "survey" not in data["partial_scores"]


def test_render_answer_panel_empty_when_builtin_grading_false() -> None:
    """Test that the answer panel always renders empty when builtin-grading='false'."""
    data = _make_question_data()
    pl_multiple_choice.prepare(NO_CORRECT_ELEMENT_HTML, data)
    data["panel"] = "answer"
    data["editable"] = False

    result = pl_multiple_choice.render(NO_CORRECT_ELEMENT_HTML, data)

    assert result == ""


def test_render_answer_panel_empty_even_with_correct_answer() -> None:
    """Test that the answer panel is empty when builtin-grading='false' even if a correct answer exists."""
    html = """
    <pl-multiple-choice answers-name="q" builtin-grading="false" order="fixed">
      <pl-answer correct="true">Right</pl-answer>
      <pl-answer>Wrong</pl-answer>
    </pl-multiple-choice>
    """
    data = _make_question_data()
    pl_multiple_choice.prepare(html, data)
    assert data["correct_answers"]["q"] is not None

    data["panel"] = "answer"
    data["editable"] = False
    result = pl_multiple_choice.render(html, data)
    assert result == ""


def test_test_submits_valid_answer_when_builtin_grading_false() -> None:
    """Test that test() submits a valid answer without setting scores when builtin-grading='false'."""
    data = _make_question_data()
    pl_multiple_choice.prepare(NO_CORRECT_ELEMENT_HTML, data)
    data["test_type"] = "correct"

    pl_multiple_choice.test(NO_CORRECT_ELEMENT_HTML, data)

    assert "survey" in data["raw_submitted_answers"]
    assert "survey" not in data["partial_scores"]


def test_test_invalid_submission_when_builtin_grading_false() -> None:
    """Test that test() handles invalid submission correctly when builtin-grading='false'."""
    data = _make_question_data()
    pl_multiple_choice.prepare(NO_CORRECT_ELEMENT_HTML, data)
    data["test_type"] = "invalid"

    pl_multiple_choice.test(NO_CORRECT_ELEMENT_HTML, data)

    assert data["raw_submitted_answers"]["survey"] == "0"
    assert "survey" in data["format_errors"]
