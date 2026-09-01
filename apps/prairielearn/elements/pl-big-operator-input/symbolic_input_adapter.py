from __future__ import annotations

import importlib
import re
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any

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


pl_symbolic_input = _load_controller()


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
    data: pl.QuestionData,
    *,
    name: str,
    variables: tuple[str, ...],
    custom_functions: tuple[str, ...],
    aria_label: str,
    size: int,
    allowed_types: set[str],
    allow_complex: bool,
    show_help_text: bool = False,
    show_score: bool = False,
    prefix: str | None = None,
    suffix: str | None = None,
    score: float | None = None,
) -> str:
    view = _render_data_view(data)
    if score is not None:
        view["partial_scores"] = dict(view["partial_scores"])
        view["partial_scores"][name] = {"score": score}
    config = pl_symbolic_input.RenderConfig(
        name=name,
        label=prefix,
        aria_label=aria_label,
        suffix=suffix,
        variables=list(variables),
        initial_value_variables=list(variables),
        custom_functions=list(custom_functions),
        display=pl_symbolic_input.DisplayType.INLINE,
        allow_complex=allow_complex,
        imaginary_unit="i",
        allow_trig=True,
        allowed_types=allowed_types,
        simplify_expression=True,
        display_log_as_ln=False,
        size=size,
        placeholder="",
        show_score=show_score,
        show_info=show_help_text,
        formula_editor=True,
        initial_value=None,
    )
    rendered = pl_symbolic_input.render_with_config(config, view)
    # The formula-editor template does not apply its aria-label parameter to the
    # math-field, so bridge that accessibility gap in the adapter.
    rendered = rendered.replace(
        "<math-field", f'<math-field aria-label="{aria_label}"', 1
    )
    if score is not None:
        # The wrapper's component badges are intentionally icon-only.
        rendered = re.sub(r" \d+%</span>", "</span>", rendered)
    return rendered
