import pathlib
import random
import re
from enum import Enum
from sys import get_int_max_str_digits
from typing import assert_never

import chevron
import lxml.html
import prairielearn as pl
import prairielearn.sympy_utils as psu
import sympy


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"


WEIGHT_DEFAULT = 1
VARIABLES_DEFAULT = None
CUSTOM_FUNCTIONS_DEFAULT = None
LABEL_DEFAULT = None
ARIA_LABEL_DEFAULT = None
SUFFIX_DEFAULT = None
DISPLAY_DEFAULT = DisplayType.INLINE
ALLOW_COMPLEX_DEFAULT = False
ALLOW_SETS_DEFAULT = False
DISPLAY_LOG_AS_LN_DEFAULT = False
DISPLAY_SIMPLIFIED_EXPRESSION_DEFAULT = True
IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT = "i"
ALLOW_TRIG_FUNCTIONS_DEFAULT = True
ADDITIONAL_SIMPLIFICATIONS_DEFAULT = None
SIZE_DEFAULT = 35
SHOW_FORMULA_EDITOR_DEFAULT = False
SHOW_HELP_TEXT_DEFAULT = True
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = "0"
PLACEHOLDER_DEFAULT = "symbolic expression"
SHOW_SCORE_DEFAULT = True
INITIAL_VALUE_DEFAULT = None
SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME = "pl-symbolic-input.mustache"
# This timeout is chosen to allow multiple sympy-based elements to grade on one page,
# while not exceeding the global timeout enforced for Python execution.
SYMPY_TIMEOUT = 3

SCHEMA_PATH = pathlib.Path(__file__).parent / "schemas" / "pl-symbolic-input.json"


def _get_variables_with_fallback(
    element: lxml.html.HtmlElement,
    data: pl.QuestionData,
    name: str,
) -> list[str]:
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    if not pl.has_attrib(element, "variables"):
        a_tru = data["correct_answers"].get(name, {})
        if isinstance(a_tru, dict) and "_variables" in a_tru:
            variables = a_tru["_variables"]
    return variables


def _replace_imaginary_for_display(
    expr: sympy.Expr, imaginary_unit: str
) -> sympy.Basic:
    return expr.subs(sympy.I, sympy.Symbol(imaginary_unit))


# Additional simplifications supported by SymPy
SYMPY_ADDITIONAL_SIMPLIFICATIONS = {
    "expand": sympy.expand,
    "powsimp": sympy.powsimp,
    "trigsimp": sympy.trigsimp,
    "expand_log": sympy.expand_log,
}


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.validate_element(element, SCHEMA_PATH)
    name = pl.get_string_attrib(element, "answers-name")

    # Validate that user-specified variables/functions don't conflict with built-ins
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions = psu.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
    )
    allow_sets = pl.get_boolean_attrib(element, "allow-sets", ALLOW_SETS_DEFAULT)
    simplify_expression = pl.get_boolean_attrib(
        element,
        "display-simplified-expression",
        DISPLAY_SIMPLIFIED_EXPRESSION_DEFAULT,
    )
    psu.validate_names_for_conflicts(
        name,
        variables,
        custom_functions,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig,
        allow_sets=allow_sets,
    )

    pl.check_answers_names(data, name)

    if pl.has_attrib(element, "correct-answer"):
        if name in data["correct_answers"]:
            raise ValueError(f"duplicate correct_answers variable name: {name}")

        a_true = pl.get_string_attrib(element, "correct-answer")

        allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
        blank_value = pl.get_string_attrib(element, "blank-value", BLANK_VALUE_DEFAULT)
        # Validate that the answer can be parsed before storing
        if a_true.strip() != "":
            try:
                psu.convert_string_to_sympy(
                    a_true,
                    variables,
                    allow_complex=allow_complex,
                    allow_sets=allow_sets,
                    allow_trig_functions=allow_trig,
                    custom_functions=custom_functions,
                    simplify_expression=simplify_expression,
                )
            except psu.BaseSympyError as exc:
                raise ValueError(
                    f'Parsing correct answer "{a_true}" for "{name}" failed.'
                ) from exc
        elif allow_blank and blank_value == "":
            a_true = ""
        else:
            raise ValueError(
                "Correct answer cannot be blank unless 'allow-blank' is true and 'blank-value' is empty."
            )

        data["correct_answers"][name] = a_true

    variables = _get_variables_with_fallback(element, data, name)

    formula_editor = pl.get_boolean_attrib(
        element, "formula-editor", SHOW_FORMULA_EDITOR_DEFAULT
    )
    initial_value = pl.get_string_attrib(
        element, "initial-value", INITIAL_VALUE_DEFAULT
    )
    # Don't parse the initial value if it's not a formula editor, so that you can prefill
    # partial inputs.
    if formula_editor and initial_value is not None and initial_value.strip() != "":
        try:
            psu.convert_string_to_sympy(
                initial_value,
                variables,
                allow_complex=allow_complex,
                allow_sets=allow_sets,
                allow_trig_functions=allow_trig,
                custom_functions=custom_functions,
                simplify_expression=simplify_expression,
            )
        except psu.BaseSympyError as exc:
            raise ValueError(
                f'Parsing initial value "{initial_value}" for "{name}" failed.'
            ) from exc

    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    if imaginary_unit not in {"i", "j"}:
        raise ValueError("imaginary-unit-for-display must be either i or j")

    additional_simplifications = psu.get_items_list(
        pl.get_string_attrib(
            element, "additional-simplifications", ADDITIONAL_SIMPLIFICATIONS_DEFAULT
        )
    )
    if allow_sets and additional_simplifications:
        raise ValueError(
            "The 'additional-simplifications' attribute cannot be used when 'allow-sets' is true."
        )
    # Note: it is an intentional decision to allow repeats in the list, as this might be (rarely) an
    # intended way to work around SymPy limitations
    if not all(
        item in SYMPY_ADDITIONAL_SIMPLIFICATIONS for item in additional_simplifications
    ):
        raise ValueError(
            "The 'additional-simplifications' contain one of more unsupported simplification(s). Please see the documentation for a full list of supported simplifications."
        )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    label = pl.get_string_attrib(element, "label", LABEL_DEFAULT)
    aria_label = pl.get_string_attrib(element, "aria-label", ARIA_LABEL_DEFAULT)
    suffix = pl.get_string_attrib(element, "suffix", SUFFIX_DEFAULT)
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions = psu.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    display = pl.get_enum_attrib(element, "display", DisplayType, DISPLAY_DEFAULT)
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
    )
    allow_sets = pl.get_boolean_attrib(element, "allow-sets", ALLOW_SETS_DEFAULT)
    simplify_expression = pl.get_boolean_attrib(
        element, "display-simplified-expression", DISPLAY_SIMPLIFIED_EXPRESSION_DEFAULT
    )
    display_log_as_ln = pl.get_boolean_attrib(
        element, "display-log-as-ln", DISPLAY_LOG_AS_LN_DEFAULT
    )
    size = pl.get_integer_attrib(element, "size", SIZE_DEFAULT)
    placeholder = pl.get_string_attrib(element, "placeholder", PLACEHOLDER_DEFAULT)
    show_score = pl.get_boolean_attrib(element, "show-score", SHOW_SCORE_DEFAULT)
    show_info = pl.get_boolean_attrib(element, "show-help-text", SHOW_HELP_TEXT_DEFAULT)
    constants_class = psu._Constants

    operators: list[str] = list(psu.STANDARD_OPERATORS)
    if allow_sets:
        operators.extend(psu.SET_NOTATION_OPERATORS)
    operators.extend(custom_functions)
    operators.extend(constants_class.functions.keys())
    if allow_trig:
        operators.extend(constants_class.trig_functions.keys())
    if allow_sets:
        operators.extend(constants_class.set_functions.keys())

    constants = list(constants_class.variables.keys())

    info_params = {
        "format": True,
        "variables": variables,
        "operators": operators,
        "constants": constants,
        "allow_complex": allow_complex,
        "allow_sets": allow_sets,
    }

    with open(SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
        template = f.read()

    info = chevron.render(template, info_params).strip()

    parse_error: str | None = data["format_errors"].get(name)
    missing_input = False
    a_sub_converted = None

    if parse_error is None and name in data["submitted_answers"]:
        a_sub = data["submitted_answers"][name]

        if isinstance(a_sub, str) and a_sub.strip() == "":
            a_sub_parsed = ""
        elif isinstance(a_sub, str):
            # this is for backward-compatibility
            a_sub_parsed = _replace_imaginary_for_display(
                psu.convert_string_to_sympy(
                    a_sub,
                    variables,
                    allow_complex=allow_complex,
                    allow_sets=allow_sets,
                    custom_functions=custom_functions,
                    allow_trig_functions=allow_trig,
                    simplify_expression=simplify_expression,
                ),
                imaginary_unit,
            )
        else:
            a_sub_parsed = _replace_imaginary_for_display(
                psu.json_to_sympy(
                    a_sub,
                    allow_complex=allow_complex,
                    allow_sets=allow_sets,
                    allow_trig_functions=allow_trig,
                    simplify_expression=simplify_expression,
                ),
                imaginary_unit,
            )

        if display_log_as_ln and a_sub_parsed != "":
            a_sub_parsed = a_sub_parsed.replace(sympy.log, sympy.Function("ln"))
        a_sub_converted = "" if a_sub_parsed == "" else sympy.latex(a_sub_parsed)
    elif name not in data["submitted_answers"]:
        missing_input = True
        parse_error = None
    # Use the existing format text in the invalid popup and render it
    elif parse_error is not None:
        parse_error += chevron.render(
            template, {"format_error": True, "format_string": info}
        ).strip()

    # Next, get some attributes we will use in multiple places
    formula_editor = pl.get_boolean_attrib(
        element, "formula-editor", SHOW_FORMULA_EDITOR_DEFAULT
    )
    initial_value = pl.get_string_attrib(
        element, "initial-value", INITIAL_VALUE_DEFAULT
    )
    raw_submitted_answer_latex = data["raw_submitted_answers"].get(
        name + "-latex", None
    )
    raw_submitted_answer = data["raw_submitted_answers"].get(name, None)
    if raw_submitted_answer is None:
        raw_submitted_answer = initial_value
    if (
        raw_submitted_answer_latex is None
        and initial_value is not None
        and initial_value.strip() != ""
        and formula_editor
    ):
        initial_parsed = _replace_imaginary_for_display(
            psu.convert_string_to_sympy(
                initial_value,
                _get_variables_with_fallback(element, data, name),
                allow_complex=allow_complex,
                allow_sets=allow_sets,
                custom_functions=custom_functions,
                allow_trig_functions=allow_trig,
                simplify_expression=simplify_expression,
            ),
            imaginary_unit,
        )
        if display_log_as_ln:
            initial_parsed = initial_parsed.replace(sympy.log, sympy.Function("ln"))
        raw_submitted_answer_latex = sympy.latex(initial_parsed)

    score = data["partial_scores"].get(name, {}).get("score")

    if data["panel"] == "question":
        editable = data["editable"]

        html_params = {
            "question": True,
            "name": name,
            "label": label,
            "aria_label": aria_label,
            "suffix": suffix,
            "editable": editable,
            "info": info,
            "placeholder": placeholder,
            "size": size,
            "show_info": show_info,
            "uuid": pl.get_uuid(),
            "allow_complex": allow_complex,
            "allow_trig": allow_trig,
            "allow_sets": allow_sets,
            "imaginary_unit": imaginary_unit,
            "log_as_ln": display_log_as_ln,
            "raw_submitted_answer": raw_submitted_answer,
            "raw_submitted_answer_latex": raw_submitted_answer_latex,
            "parse_error": parse_error,
            display.value: True,
            "formula_editor": formula_editor,
            "custom_functions": ",".join(custom_functions),
        }

        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        return chevron.render(template, html_params).strip()

    elif data["panel"] == "submission":
        html_params = {
            "submission": True,
            "label": label,
            "suffix": suffix,
            "parse_error": parse_error,
            "uuid": pl.get_uuid(),
            "a_sub": a_sub_converted,
            "raw_submitted_answer": raw_submitted_answer,
            "raw_submitted_answer_latex": raw_submitted_answer_latex,
            "formula_editor": formula_editor,
            "custom_functions": ",".join(custom_functions),
            "allow_trig": allow_trig,
            "allow_sets": allow_sets,
            "imaginary_unit": imaginary_unit,
            "log_as_ln": display_log_as_ln,
            display.value: True,
            "error": parse_error or missing_input,
            "missing_input": missing_input,
        }

        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        return chevron.render(template, html_params).strip()

    elif data["panel"] == "answer":
        a_tru = data["correct_answers"].get(name)
        if a_tru is None:
            return ""

        elif isinstance(a_tru, str):
            if a_tru != "":
                # this is so instructors can specify the true answer simply as a string
                a_tru = _replace_imaginary_for_display(
                    psu.convert_string_to_sympy(
                        a_tru,
                        variables,
                        allow_complex=allow_complex,
                        allow_sets=allow_sets,
                        allow_trig_functions=allow_trig,
                        custom_functions=custom_functions,
                        simplify_expression=simplify_expression,
                    ),
                    imaginary_unit,
                )
        else:
            a_tru = _replace_imaginary_for_display(
                psu.json_to_sympy(
                    a_tru,
                    allow_complex=allow_complex,
                    allow_sets=allow_sets,
                    allow_trig_functions=allow_trig,
                    simplify_expression=simplify_expression,
                ),
                imaginary_unit,
            )

        if display_log_as_ln and a_tru != "":
            a_tru = a_tru.replace(sympy.log, sympy.Function("ln"))

        html_params = {
            "answer": True,
            "label": label,
            "suffix": suffix,
            "a_tru": sympy.latex(a_tru),
            display.value: True,
        }
        return chevron.render(template, html_params).strip()

    assert_never(data["panel"])


def _apply_parse_constraints_to_sympy_expr(
    expr: sympy.Basic,
    *,
    variables: list[str],
    custom_functions: list[str],
    assumptions: psu.AssumptionsDictT | None,
    allow_complex: bool,
    allow_sets: bool,
    allow_trig: bool,
    simplify_expression: bool,
) -> sympy.Basic:
    expr_json = psu.sympy_to_json(
        expr,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig,
    )
    expr_json["_variables"] = variables
    expr_json["_custom_functions"] = custom_functions
    if assumptions is not None:
        expr_json["_assumptions"] = assumptions

    return psu.json_to_sympy(
        expr_json,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig,
        simplify_expression=simplify_expression,
    )


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    variables = _get_variables_with_fallback(element, data, name)

    custom_functions = psu.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
    )
    allow_sets = pl.get_boolean_attrib(element, "allow-sets", ALLOW_SETS_DEFAULT)
    simplify_expression = pl.get_boolean_attrib(
        element, "display-simplified-expression", DISPLAY_SIMPLIFIED_EXPRESSION_DEFAULT
    )
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    blank_value = pl.get_string_attrib(element, "blank-value", BLANK_VALUE_DEFAULT)
    formula_editor = pl.get_boolean_attrib(
        element, "formula-editor", SHOW_FORMULA_EDITOR_DEFAULT
    )

    submitted_answer = data["submitted_answers"].get(name, None)
    raw_mathjson = data["submitted_answers"].get(f"{name}-json")
    use_mathjson = (
        formula_editor and isinstance(raw_mathjson, str) and raw_mathjson.strip() != ""
    )

    if submitted_answer is None:
        data["format_errors"][name] = "No submitted answer."
        data["submitted_answers"][name] = None
        return

    if isinstance(submitted_answer, str) and submitted_answer.strip() == "":
        if allow_blank:
            submitted_answer = blank_value
            use_mathjson = False
            if submitted_answer.strip() == "":
                data["submitted_answers"][name] = ""
                return
        else:
            data["format_errors"][name] = "No submitted answer."
            data["submitted_answers"][name] = None
            return

    assumptions_dict: psu.AssumptionsDictT | None = None
    a_tru = data["correct_answers"].get(name, {})
    if isinstance(a_tru, dict):
        assumptions_dict = a_tru.get("_assumptions", {})

    a_sub_parsed = None

    if use_mathjson:
        from mathjson_utils import MathJsonStudentError, raw_mathjson_to_sympy_expr

        try:
            if not isinstance(raw_mathjson, str):
                raise TypeError("MathJSON submission must be a string.")
            sympy_expr = raw_mathjson_to_sympy_expr(
                raw_mathjson, allow_sets=allow_sets, allow_trig=allow_trig
            )
            result = _apply_parse_constraints_to_sympy_expr(
                sympy_expr,
                variables=variables,
                custom_functions=custom_functions,
                assumptions=assumptions_dict,
                allow_complex=allow_complex,
                allow_sets=allow_sets,
                allow_trig=allow_trig,
                simplify_expression=simplify_expression,
            )
        except MathJsonStudentError as e:
            data["format_errors"][name] = f"Parse error: {e}"
            data["submitted_answers"][name] = None
            return
        except Exception:
            data["format_errors"][name] = (
                "Parse error: Could not parse submitted answer."
            )
            data["submitted_answers"][name] = None
            return
        a_sub_parsed = result
    else:
        # Pre-processing to make submission parseable by SymPy
        a_sub, error_msg = format_submission_for_sympy(
            submitted_answer, allow_sets=allow_sets
        )
        if error_msg is not None:
            data["format_errors"][name] = error_msg
            data["submitted_answers"][name] = None
            return

        if a_sub is None:
            # this branch should not be taken
            data["format_errors"][name] = "No submitted answer."
            data["submitted_answers"][name] = None
            return

        result = psu.try_parse_string_as_sympy(
            a_sub,
            variables,
            allow_hidden=True,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig,
            imaginary_unit=imaginary_unit,
            custom_functions=custom_functions,
            simplify_expression=simplify_expression,
            assumptions=assumptions_dict,
        )

        if isinstance(result, psu.SympyParseFailure):
            data["format_errors"][name] = result.error
            data["submitted_answers"][name] = None
            return

        a_sub_parsed = result.expr

    # Make sure we can parse the json again
    try:
        a_sub_json = psu.sympy_to_json(
            a_sub_parsed,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig,
        )

        # Convert safely to sympy
        psu.json_to_sympy(
            a_sub_json,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig,
            simplify_expression=simplify_expression,
        )

        # Finally, store the result
        data["submitted_answers"][name] = a_sub_json
    except Exception:
        data["format_errors"][name] = (
            f"Your answer was simplified to this, which contains an invalid expression: $${sympy.latex(a_sub_parsed)}$$"
        )
        data["submitted_answers"][name] = None


def format_submission_for_sympy(
    sub: str | None, *, allow_sets: bool = False
) -> tuple[str | None, str | None]:
    """
    Format submission to be compatible with SymPy.

    Converts absolute value bars to abs() function calls, handling nested cases.

    Examples:
        "|x|" becomes "abs(x)"
        "||x|+y|" becomes "abs(abs(x)+y)"

    Args:
        sub: The text submission to format
        allow_sets: If true, leave any residual ``|`` characters in place
            so the SymPy parser can interpret them as set-union operators.

    Returns:
        A tuple of (Formatted text with absolute value bars replaced by abs() calls, or None if input is None, and an error message if there is an error)
    """
    original_sub = sub
    if sub is None:
        return None, None

    pattern = re.compile(
        r"(\|\s*[a-zA-Z0-9(+\-]([^|]*[a-zA-Z0-9!)])\s*\|)|(\|\s*[a-zA-Z0-9]\s*\|)"
    )
    search_from = 0
    while True:
        # Find matches of |...| where:
        # when ignoring spaces, it either:
        # - starts with letter/number/opening paren/plus/minus and ends with letter/number/closing/exclamation mark paren
        # - is a single leter/number
        match = pattern.search(sub, search_from)
        if not match:
            break

        content = match.group(0)[1:-1]  # Strip the bars
        # When set notation is allowed, a comma inside the match means the
        # pipes are a union operator pair around an interval or finite set
        # (e.g. the middle pipes in ``[0,1] | (2,3) | [4,5]``), not an
        # absolute value.
        # TODO: This can skip min/max operators or other functions that contain commas.
        if allow_sets and "," in content:
            search_from = match.start() + 1
            continue

        sub = sub[: match.start()] + f"abs({content})" + sub[match.end() :]
        search_from = 0

    if not allow_sets and "|" in sub:
        return (
            None,
            f"The absolute value bars in your answer are mismatched or ambiguous: <code>{original_sub}</code>.",
        )

    return sub, None


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions = psu.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    allow_sets = pl.get_boolean_attrib(element, "allow-sets", ALLOW_SETS_DEFAULT)
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
    )
    simplify_expression = pl.get_boolean_attrib(
        element, "display-simplified-expression", DISPLAY_SIMPLIFIED_EXPRESSION_DEFAULT
    )
    additional_simplifications = psu.get_items_list(
        pl.get_string_attrib(
            element, "additional-simplifications", ADDITIONAL_SIMPLIFICATIONS_DEFAULT
        )
    )
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = data["correct_answers"].get(name, None)
    if a_tru is None:
        return

    def grade_function(a_sub: str | psu.SympyJson) -> tuple[bool, None]:
        # Special case: submitted answer or correct answer is the empty string
        if isinstance(a_tru, str) and a_tru == "":
            if isinstance(a_sub, str) and a_sub == "":
                return True, None
            else:
                return False, None
        elif isinstance(a_sub, str) and a_sub == "":
            return False, None

        # Parse true answer
        if isinstance(a_tru, str):
            # this is so instructors can specify the true answer simply as a string
            a_tru_sympy = psu.convert_string_to_sympy(
                a_tru,
                variables,
                allow_complex=allow_complex,
                allow_sets=allow_sets,
                allow_trig_functions=allow_trig,
                custom_functions=custom_functions,
                simplify_expression=simplify_expression,
            )
        else:
            a_tru_sympy = psu.json_to_sympy(
                a_tru,
                allow_complex=allow_complex,
                allow_sets=allow_sets,
                simplify_expression=simplify_expression,
            )

        # Parse submitted answer
        if isinstance(a_sub, str):
            # this is for backward-compatibility
            a_sub_sympy = psu.convert_string_to_sympy(
                a_sub,
                variables,
                allow_complex=allow_complex,
                allow_sets=allow_sets,
                allow_trig_functions=allow_trig,
                custom_functions=custom_functions,
                assumptions=a_tru_sympy.assumptions0,
                simplify_expression=simplify_expression,
            )
        else:
            a_sub_sympy = psu.json_to_sympy(
                a_sub,
                allow_complex=allow_complex,
                allow_sets=allow_sets,
                allow_trig_functions=allow_trig,
                simplify_expression=simplify_expression,
            )

        for simplification in additional_simplifications:
            simp_f = SYMPY_ADDITIONAL_SIMPLIFICATIONS[simplification]
            a_sub_sympy = simp_f(a_sub_sympy)
            a_tru_sympy = simp_f(a_tru_sympy)
            # Make the type checker happy
            assert isinstance(a_sub_sympy, sympy.Expr)
            assert isinstance(a_tru_sympy, sympy.Expr)

        if isinstance(a_tru_sympy, sympy.Set) or isinstance(a_sub_sympy, sympy.Set):
            return a_tru_sympy == a_sub_sympy, None

        return a_tru_sympy.equals(a_sub_sympy) is True, None

    try:
        pl.grade_answer_parameterized(
            data,
            name,
            grade_function,
            weight=weight,
            timeout=SYMPY_TIMEOUT,
            timeout_format_error="Your answer did not converge, try a simpler expression.",
        )
    except ValueError as e:
        # We only want to catch the integer string conversion limit ValueError.
        # Others might be outside of the student's control and should error like normal.
        #
        # Entering an expression like 2^(20000*x) will cause this error, despite the fact
        # an expression like 2^(14000x) will render the exponent as expected. Sympy
        # expands constants internally, so these expressions evaluate to ((2^c)^x),
        # then 2^c is evaluated and converted to a string.
        if "integer string conversion" in str(e):
            data["format_errors"][name] = (
                f"Your expression expands integers longer than {get_int_max_str_digits()} digits, "
                "try a simpler expression."
            )
        else:
            raise


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions = psu.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    allow_sets = pl.get_boolean_attrib(element, "allow-sets", ALLOW_SETS_DEFAULT)
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
    )
    simplify_expression = pl.get_boolean_attrib(
        element, "display-simplified-expression", DISPLAY_SIMPLIFIED_EXPRESSION_DEFAULT
    )
    formula_editor = pl.get_boolean_attrib(
        element, "formula-editor", SHOW_FORMULA_EDITOR_DEFAULT
    )
    result = data["test_type"]
    a_tru_str = ""
    a_tru_sympy: sympy.Basic | None = None

    if result in ["correct", "incorrect"]:
        if name not in data["correct_answers"]:
            # This element cannot test itself. Defer the generation of test inputs to server.py
            return

        # Get raw correct answer
        a_tru = data["correct_answers"][name]

        # Parse correct answer based on type
        if isinstance(a_tru, str):
            if a_tru != "":
                a_tru = psu.convert_string_to_sympy(
                    a_tru,
                    variables,
                    allow_complex=allow_complex,
                    allow_sets=allow_sets,
                    allow_trig_functions=allow_trig,
                    custom_functions=custom_functions,
                    simplify_expression=simplify_expression,
                )
        else:
            a_tru = psu.json_to_sympy(
                a_tru,
                allow_complex=allow_complex,
                allow_sets=allow_sets,
                allow_trig_functions=allow_trig,
            )

        if a_tru != "":
            assert isinstance(a_tru, sympy.Basic)
            a_tru_sympy = a_tru
            # Substitute in imaginary unit symbol
            a_tru_str = str(_replace_imaginary_for_display(a_tru, imaginary_unit))

    if result == "correct":
        if formula_editor and a_tru_sympy is not None:
            from mathjson_utils import sympy_expr_to_raw_mathjson

            data["raw_submitted_answers"][name] = a_tru_str
            data["raw_submitted_answers"][f"{name}-json"] = sympy_expr_to_raw_mathjson(
                a_tru_sympy
            )
        elif a_tru_str == "":
            data["raw_submitted_answers"][name] = ""
        else:
            correct_answers = [a_tru_str]
            # Arithmetic-style variants below don't apply to sets/intervals.
            if not allow_sets:
                correct_answers.append(f"{a_tru_str} + 0")
                if allow_complex:
                    correct_answers.append(f"2j + {a_tru_str} - 3j + j")
                if allow_trig:
                    correct_answers.append(f"cos(0) * ( {a_tru_str} )")

            data["raw_submitted_answers"][name] = random.choice(correct_answers)
        data["partial_scores"][name] = {"score": 1, "weight": weight}

    elif result == "incorrect":
        incorrect_offset = random.randint(1, 100)
        if a_tru_str == "" or allow_sets:
            incorrect_answer = sympy.Integer(incorrect_offset)
        else:
            assert a_tru_sympy is not None
            incorrect_answer = sympy.Add(a_tru_sympy, incorrect_offset)

        if formula_editor:
            from mathjson_utils import sympy_expr_to_raw_mathjson

            data["raw_submitted_answers"][name] = str(
                _replace_imaginary_for_display(incorrect_answer, imaginary_unit)
            )
            data["raw_submitted_answers"][f"{name}-json"] = sympy_expr_to_raw_mathjson(
                incorrect_answer
            )
        elif a_tru_str == "" or allow_sets:
            data["raw_submitted_answers"][name] = str(incorrect_answer)
        else:
            data["raw_submitted_answers"][name] = f"{a_tru_str} + {incorrect_offset:d}"
        data["partial_scores"][name] = {"score": 0, "weight": weight}

    elif result == "invalid":
        invalid_answers = [
            "n + 1.234",
            "x + (1+2j)",
            "1 and 0",
            "aatan(n)",
            "x + y",
            "x +* 1",
            "x + 1\\n",
            "x # some text",
        ]
        if not allow_complex:
            invalid_answers.append("3j")
        if not allow_trig:
            invalid_answers.append("cos(2)")

        # TODO add back detailed format errors if this gets checked in the future
        data["raw_submitted_answers"][name] = random.choice(invalid_answers)
        data["format_errors"][name] = ""
    else:
        assert_never(result)
