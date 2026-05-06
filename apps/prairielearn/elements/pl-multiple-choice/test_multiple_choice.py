import importlib
from typing import Any

import pytest

pl_multiple_choice = importlib.import_module("pl-multiple-choice")

prepare_answers_to_display = pl_multiple_choice.prepare_answers_to_display
AotaNotaType = pl_multiple_choice.AotaNotaType
OrderType = pl_multiple_choice.OrderType
DisplayType = pl_multiple_choice.DisplayType
AnswerTuple = pl_multiple_choice.AnswerTuple


def make_answers(
    correct: list[str], incorrect: list[str]
) -> tuple[list[Any], list[Any]]:
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
    with pytest.raises(ValueError, match="at least 1 correct answer"):
        _prepare_with_defaults([], ["A", "B", "C"])


def test_no_correct_answers_allowed_without_builtin_grading() -> None:
    result = _prepare_with_defaults([], ["A", "B", "C"], builtin_grading=False)
    assert len(result) == 3
    assert all(not a.correct for a in result)


def test_builtin_grading_false_with_correct_answers_still_works() -> None:
    result = _prepare_with_defaults(["A"], ["B", "C"], builtin_grading=False)
    assert len(result) == 3
    assert sum(1 for a in result if a.correct) == 1


def test_builtin_grading_true_is_default_behavior() -> None:
    with pytest.raises(ValueError, match="at least 1 correct answer"):
        _prepare_with_defaults([], ["A", "B"], builtin_grading=True)
