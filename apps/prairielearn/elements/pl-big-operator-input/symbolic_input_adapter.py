from __future__ import annotations

import importlib
import re
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

import lxml.html

if TYPE_CHECKING:
    from types import ModuleType

    import prairielearn as pl

HERE = Path(__file__).parent
SOURCE_DIR = HERE.parent / "pl-symbolic-input"
TEMPLATE_PATH = SOURCE_DIR / "pl-symbolic-input.mustache"


def _load_controller() -> ModuleType:
    sys.path.insert(0, str(SOURCE_DIR))
    try:
        module = importlib.import_module("pl-symbolic-input")
    finally:
        sys.path.remove(str(SOURCE_DIR))
    # Element controllers normally run with their own directory as the working directory.
    # This adapter invokes the controller from a different element, so use an absolute path.
    module.SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME = str(TEMPLATE_PATH)  # type: ignore
    return module


CONTROLLER = _load_controller()


def markup(
    *,
    name: str,
    variables: tuple[str, ...],
    custom_functions: tuple[str, ...],
    label: str,
    size: int,
    allowed_types: Literal["all", "expression"],
    allow_complex: bool,
    show_help_text: bool = False,
    show_score: bool = False,
    prefix: str | None = None,
    suffix: str | None = None,
) -> str:
    element = lxml.html.Element("pl-symbolic-input")
    attributes = {
        "answers-name": name,
        "variables": ",".join(variables),
        "formula-editor": "true",
        "show-help-text": str(show_help_text).lower(),
        "show-score": str(show_score).lower(),
        "placeholder": "",
        "size": str(size),
        "aria-label": label,
        "allowed-types": allowed_types,
        "allow-complex": str(allow_complex).lower(),
    }
    if custom_functions:
        attributes["custom-functions"] = ",".join(custom_functions)
    if prefix is not None:
        attributes["label"] = prefix
    if suffix is not None:
        attributes["suffix"] = suffix
    for key, value in attributes.items():
        element.set(key, value)
    return str(lxml.html.tostring(element, encoding="unicode"))


def _render_data_view(data: dict[str, Any] | pl.QuestionData) -> dict[str, Any]:
    view = dict(data)
    view.setdefault("correct_answers", {})
    view.setdefault("format_errors", {})
    view.setdefault("partial_scores", {})
    view.setdefault("raw_submitted_answers", {})
    view.setdefault("submitted_answers", {})
    view.setdefault("panel", "question")
    view.setdefault("editable", view["panel"] == "question")
    return view


def render(
    field_markup: str,
    data: pl.QuestionData,
    *,
    aria_label: str,
    score: float | None = None,
) -> str:
    view = _render_data_view(data)
    if score is not None:
        element = lxml.html.fragment_fromstring(field_markup)
        name = element.get("answers-name")
        if name:
            view["partial_scores"] = dict(view["partial_scores"])
            view["partial_scores"][name] = {"score": score}
    rendered = CONTROLLER.render(field_markup, view)
    # The formula-editor template does not apply its aria-label parameter to the
    # math-field, so bridge that accessibility gap in the adapter.
    rendered = rendered.replace(
        "<math-field", f'<math-field aria-label="{aria_label}"', 1
    )
    if score is not None:
        # The wrapper's component badges are intentionally icon-only.
        rendered = re.sub(r" \d+%</span>", "</span>", rendered)
    return rendered
