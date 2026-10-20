import importlib.machinery
import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Literal, Protocol, cast

import lxml.html
import prairielearn as pl
import pytest

ELEMENTS_DIR = Path(__file__).parents[2] / "elements"


class ElementController(Protocol):
    def render(self, element_html: str, data: pl.QuestionData) -> str: ...


def load_element_controller(
    element_name: str, monkeypatch: pytest.MonkeyPatch
) -> ElementController:
    element_dir = ELEMENTS_DIR / element_name
    module_name = f"raw_input_test_{element_name.replace('-', '_')}"
    loader = importlib.machinery.SourceFileLoader(
        module_name, str(element_dir / f"{element_name}.py")
    )
    spec = importlib.util.spec_from_loader(module_name, loader)
    module = ModuleType(module_name)
    module.__file__ = loader.path
    module.__spec__ = spec
    monkeypatch.syspath_prepend(str(element_dir))
    monkeypatch.chdir(element_dir)
    loader.exec_module(module)
    return cast(ElementController, module)


def make_question_data(
    *,
    panel: Literal["question", "submission", "answer"] = "submission",
    raw_submitted_answers: dict[str, str],
    format_errors: dict[str, str] | None = None,
) -> pl.QuestionData:
    return {
        "params": {},
        "preferences": {},
        "correct_answers": {},
        "submitted_answers": {"answer": None},
        "format_errors": (format_errors if format_errors is not None else {}),
        "partial_scores": {},
        "score": 0.0,
        "feedback": {},
        "variant_seed": 0,
        "options": {},
        "raw_submitted_answers": raw_submitted_answers,
        "editable": True,
        "panel": panel,
        "correct_answer_shown": False,
        "extensions": {},
        "num_valid_submissions": 0,
        "manual_grading": False,
        "ai_grading": False,
        "answers_names": {},
        "gradable": True,
    }


def test_matrix_input_question_restores_literal_raw_input(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    controller = load_element_controller("pl-matrix-input", monkeypatch)
    element_html = '<pl-matrix-input answers-name="answer"></pl-matrix-input>'
    raw_input = "[1,\u200b2]"
    data = make_question_data(
        panel="question", raw_submitted_answers={"answer": raw_input}
    )

    rendered = controller.render(element_html, data)
    root = lxml.html.fragment_fromstring(rendered, create_parent="div")

    assert root.xpath("//input[@name='answer']/@value") == [raw_input]
