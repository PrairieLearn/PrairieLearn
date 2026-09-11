"""Internal symbolic-input rendering utilities."""

from dataclasses import dataclass
from enum import Enum
from typing import assert_never

import chevron
import sympy

import prairielearn.sympy_utils as psu
from prairielearn.grading_utils import determine_score_params
from prairielearn.misc_utils import get_uuid
from prairielearn.question_utils import QuestionData


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"


@dataclass(frozen=True, slots=True, kw_only=True)
class RenderConfig:
    name: str
    label: str | None
    aria_label: str | None
    suffix: str | None
    variables: list[str]
    initial_value_variables: list[str]
    custom_functions: list[str]
    display: DisplayType
    allow_complex: bool
    imaginary_unit: str
    allow_trig: bool
    allowed_types: set[psu.AllowedSympyType]
    simplify_expression: bool
    display_log_as_ln: bool
    size: int
    placeholder: str
    show_score: bool
    show_info: bool
    formula_editor: bool
    initial_value: str | None
    show_score_percent: bool = True

    @property
    def allow_sets(self) -> bool:
        return psu.allowed_sympy_types_include_sets(self.allowed_types)


def replace_imaginary_for_display(expr: sympy.Expr, imaginary_unit: str) -> sympy.Basic:
    return expr.subs(sympy.I, sympy.Symbol(imaginary_unit))


def render_with_config(
    config: RenderConfig,
    data: QuestionData,
    *,
    template: str,
) -> str:
    operators: list[str] = list(psu.STANDARD_OPERATORS)
    if config.allow_sets:
        operators.extend(psu.SET_NOTATION_OPERATORS)
    operators.extend(config.custom_functions)
    operators.extend(psu._Constants.functions.keys())
    if config.allow_trig:
        operators.extend(psu._Constants.trig_functions.keys())
    if config.allow_sets:
        operators.extend(psu._Constants.set_functions.keys())

    constants = list(psu._Constants.variables.keys())

    info_params = {
        "format": True,
        "variables": config.variables,
        "operators": operators,
        "constants": constants,
        "allow_complex": config.allow_complex,
        "allow_sets": config.allow_sets,
    }

    info = chevron.render(template, info_params).strip()

    parse_error: str | None = data["format_errors"].get(config.name)
    missing_input = False
    a_sub_converted = None

    if parse_error is not None:
        # Use the existing format text in the invalid popup and render it
        parse_error += chevron.render(
            template, {"format_error": True, "format_string": info}
        ).strip()
    elif config.name not in data["submitted_answers"]:
        missing_input = True
    else:
        a_sub = data["submitted_answers"][config.name]

        if isinstance(a_sub, str) and a_sub.strip() == "":
            a_sub_parsed = ""
        elif isinstance(a_sub, str):
            # this is for backward-compatibility
            a_sub_parsed = replace_imaginary_for_display(
                psu.convert_string_to_sympy(
                    a_sub,
                    config.variables,
                    allow_complex=config.allow_complex,
                    allow_sets=config.allow_sets,
                    custom_functions=config.custom_functions,
                    allow_trig_functions=config.allow_trig,
                    simplify_expression=config.simplify_expression,
                ),
                config.imaginary_unit,
            )
        else:
            a_sub_parsed = replace_imaginary_for_display(
                psu.json_to_sympy(
                    a_sub,
                    allow_complex=config.allow_complex,
                    allow_sets=config.allow_sets,
                    allow_trig_functions=config.allow_trig,
                    simplify_expression=config.simplify_expression,
                ),
                config.imaginary_unit,
            )

        if config.display_log_as_ln and a_sub_parsed != "":
            a_sub_parsed = a_sub_parsed.replace(sympy.log, sympy.Function("ln"))
        a_sub_converted = "" if a_sub_parsed == "" else sympy.latex(a_sub_parsed)

    raw_submitted_answer_latex = data["raw_submitted_answers"].get(
        config.name + "-latex", None
    )
    raw_submitted_answer = data["raw_submitted_answers"].get(config.name, None)
    if raw_submitted_answer is None:
        raw_submitted_answer = config.initial_value
    if (
        raw_submitted_answer_latex is None
        and config.initial_value is not None
        and config.initial_value.strip() != ""
        and config.formula_editor
    ):
        initial_parsed = replace_imaginary_for_display(
            psu.convert_string_to_sympy(
                config.initial_value,
                config.initial_value_variables,
                allow_complex=config.allow_complex,
                allow_sets=config.allow_sets,
                custom_functions=config.custom_functions,
                allow_trig_functions=config.allow_trig,
                simplify_expression=config.simplify_expression,
            ),
            config.imaginary_unit,
        )
        if config.display_log_as_ln:
            initial_parsed = initial_parsed.replace(sympy.log, sympy.Function("ln"))
        raw_submitted_answer_latex = sympy.latex(initial_parsed)

    score = data["partial_scores"].get(config.name, {}).get("score")

    def render_question() -> str:
        editable = data["editable"]

        html_params = {
            "question": True,
            "name": config.name,
            "label": config.label,
            "aria_label": config.aria_label,
            "suffix": config.suffix,
            "editable": editable,
            "info": info,
            "placeholder": config.placeholder,
            "size": config.size,
            "show_info": config.show_info,
            "uuid": get_uuid(),
            "allow_complex": config.allow_complex,
            "allow_trig": config.allow_trig,
            "allow_sets": config.allow_sets,
            "imaginary_unit": config.imaginary_unit,
            "log_as_ln": config.display_log_as_ln,
            "raw_submitted_answer": raw_submitted_answer,
            "raw_submitted_answer_latex": raw_submitted_answer_latex,
            "parse_error": parse_error,
            config.display.value: True,
            "formula_editor": config.formula_editor,
            "custom_functions": ",".join(config.custom_functions),
        }

        if config.show_score and score is not None:
            score_type, score_value = determine_score_params(score)
            html_params[score_type] = score_value

        return chevron.render(template, html_params).strip()

    def render_submission() -> str:
        html_params = {
            "submission": True,
            "label": config.label,
            "suffix": config.suffix,
            "parse_error": parse_error,
            "uuid": get_uuid(),
            "a_sub": a_sub_converted,
            "raw_submitted_answer": raw_submitted_answer,
            "raw_submitted_answer_latex": raw_submitted_answer_latex,
            "formula_editor": config.formula_editor,
            "custom_functions": ",".join(config.custom_functions),
            "allow_trig": config.allow_trig,
            "allow_sets": config.allow_sets,
            "imaginary_unit": config.imaginary_unit,
            "log_as_ln": config.display_log_as_ln,
            config.display.value: True,
            "error": parse_error or missing_input,
            "missing_input": missing_input,
            "show_score_percent": config.show_score_percent,
        }

        if config.show_score and score is not None:
            score_type, score_value = determine_score_params(score)
            html_params[score_type] = score_value

        return chevron.render(template, html_params).strip()

    def render_answer() -> str:
        a_tru = data["correct_answers"].get(config.name)
        if a_tru is None:
            return ""

        elif isinstance(a_tru, str):
            if a_tru != "":
                # this is so instructors can specify the true answer simply as a string
                a_tru = replace_imaginary_for_display(
                    psu.convert_string_to_sympy(
                        a_tru,
                        config.variables,
                        allow_complex=config.allow_complex,
                        allow_sets=config.allow_sets,
                        allow_trig_functions=config.allow_trig,
                        custom_functions=config.custom_functions,
                        simplify_expression=config.simplify_expression,
                    ),
                    config.imaginary_unit,
                )
        else:
            a_tru = replace_imaginary_for_display(
                psu.json_to_sympy(
                    a_tru,
                    allow_complex=config.allow_complex,
                    allow_sets=config.allow_sets,
                    allow_trig_functions=config.allow_trig,
                    simplify_expression=config.simplify_expression,
                ),
                config.imaginary_unit,
            )

        if config.display_log_as_ln and a_tru != "":
            a_tru = a_tru.replace(sympy.log, sympy.Function("ln"))

        html_params = {
            "answer": True,
            "label": config.label,
            "suffix": config.suffix,
            "a_tru": sympy.latex(a_tru),
            config.display.value: True,
        }
        return chevron.render(template, html_params).strip()

    match data["panel"]:
        case "question":
            return render_question()
        case "submission":
            return render_submission()
        case "answer":
            return render_answer()
        case _:
            assert_never(data["panel"])
