import prairielearn as pl
import sympy
from prairielearn.internal import symbolic_input


def _render_config() -> symbolic_input.RenderConfig:
    return symbolic_input.RenderConfig(
        name="symbolic",
        label=None,
        aria_label=None,
        suffix=None,
        variables=["x"],
        initial_value_variables=["x"],
        custom_functions=[],
        display=symbolic_input.DisplayType.INLINE,
        allow_complex=False,
        imaginary_unit="i",
        allow_trig=True,
        allowed_types={"expression"},
        simplify_expression=True,
        display_log_as_ln=False,
        size=20,
        placeholder="",
        show_score=False,
        show_info=False,
        formula_editor=False,
        initial_value=None,
    )


def test_render_with_config_uses_supplied_template_text(
    question_data: pl.QuestionData,
) -> None:
    question_data["editable"] = True
    template = (
        "{{#question}}{{name}}|{{#inline}}inline{{/inline}}|{{{info}}}{{/question}}"
        "{{#format}}variables={{#variables}}{{.}}{{/variables}}{{/format}}"
    )

    rendered = symbolic_input.render_with_config(
        _render_config(), question_data, template=template
    )

    assert rendered == "symbolic|inline|variables=x"


def test_render_with_config_prioritizes_format_error_over_missing_input(
    question_data: pl.QuestionData,
) -> None:
    question_data["panel"] = "submission"
    question_data["format_errors"]["symbolic"] = "invalid"
    template = (
        "{{#submission}}{{#parse_error}}error={{{parse_error}}}{{/parse_error}}"
        "{{#missing_input}}missing{{/missing_input}}{{/submission}}"
        "{{#format}}variables={{#variables}}{{.}}{{/variables}}{{/format}}"
        "{{#format_error}}; {{{format_string}}}{{/format_error}}"
    )

    rendered = symbolic_input.render_with_config(
        _render_config(), question_data, template=template
    )

    assert rendered == "error=invalid; variables=x"


def test_replace_imaginary_for_display() -> None:
    x = sympy.Symbol("x")

    assert symbolic_input.replace_imaginary_for_display(
        x + sympy.I, "j"
    ) == x + sympy.Symbol("j")
