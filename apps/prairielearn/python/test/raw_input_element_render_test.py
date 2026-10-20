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
        "format_errors": (
            format_errors if format_errors is not None else {"answer": "Invalid input."}
        ),
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


@pytest.mark.parametrize(
    ("element_name", "element_html"),
    [
        (
            "pl-big-o-input",
            '<pl-big-o-input answers-name="answer" variables="n"></pl-big-o-input>',
        ),
        (
            "pl-integer-input",
            '<pl-integer-input answers-name="answer"></pl-integer-input>',
        ),
        (
            "pl-matrix-input",
            '<pl-matrix-input answers-name="answer"></pl-matrix-input>',
        ),
        (
            "pl-number-input",
            '<pl-number-input answers-name="answer"></pl-number-input>',
        ),
        (
            "pl-string-input",
            '<pl-string-input answers-name="answer"></pl-string-input>',
        ),
        (
            "pl-symbolic-input",
            '<pl-symbolic-input answers-name="answer" variables="x"></pl-symbolic-input>',
        ),
        (
            "pl-units-input",
            '<pl-units-input answers-name="answer"></pl-units-input>',
        ),
    ],
)
def test_scalar_input_invalid_submission_includes_raw_input_popover(
    element_name: str, element_html: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    controller = load_element_controller(element_name, monkeypatch)
    data = make_question_data(raw_submitted_answers={"answer": "1\u200b"})

    rendered = controller.render(element_html, data)
    root = lxml.html.fragment_fromstring(rendered, create_parent="div")
    buttons = root.xpath("//button[@aria-label='Original input']")

    assert len(buttons) == 1
    assert "&lt;U+200b&gt;" in buttons[0].get("data-bs-content")
    assert "1<U+200b>" in root.text_content()


def test_matrix_component_input_popover_preserves_grid_shape(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    controller = load_element_controller("pl-matrix-component-input", monkeypatch)
    element_html = (
        '<pl-matrix-component-input answers-name="answer" rows="1" columns="2">'
        "</pl-matrix-component-input>"
    )
    data = make_question_data(
        raw_submitted_answers={"answer1": "1\u200b", "answer2": "café"}
    )

    rendered = controller.render(element_html, data)
    root = lxml.html.fragment_fromstring(rendered, create_parent="div")
    buttons = root.xpath("//button[@aria-label='Original input']")
    content = buttons[0].get("data-bs-content")

    assert len(buttons) == 1
    assert content.count("<tr>") == 2
    assert content.count("<td>") == 4
    assert "1&lt;U+200b&gt;" in content
    assert "caf&lt;U+e9&gt;" in content
    assert "1<U+200b>" in root.text_content()


def test_symbolic_formula_editor_popover_includes_text_diagnostics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    controller = load_element_controller("pl-symbolic-input", monkeypatch)
    element_html = (
        '<pl-symbolic-input answers-name="answer" variables="x" '
        'formula-editor="true"></pl-symbolic-input>'
    )
    data = make_question_data(
        raw_submitted_answers={"answer": "x\u200b", "answer-latex": "x"},
        format_errors={},
    )
    data["submitted_answers"] = {"answer": "x"}

    rendered = controller.render(element_html, data)
    root = lxml.html.fragment_fromstring(rendered, create_parent="div")
    buttons = root.xpath("//button[@aria-label='Original input']")
    content = buttons[0].get("data-bs-content")

    assert len(buttons) == 1
    assert "Formula editor input:" in content
    assert "<math-field" in content
    assert "&lt;U+200b&gt;" in content


def test_matrix_input_question_restores_literal_raw_input(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    controller = load_element_controller("pl-matrix-input", monkeypatch)
    element_html = '<pl-matrix-input answers-name="answer"></pl-matrix-input>'
    raw_input = "[1,\u200b2]"
    data = make_question_data(
        panel="question",
        raw_submitted_answers={"answer": raw_input},
        format_errors={},
    )

    rendered = controller.render(element_html, data)
    root = lxml.html.fragment_fromstring(rendered, create_parent="div")

    assert root.xpath("//input[@name='answer']/@value") == [raw_input]
