import pathlib
import random
from enum import Enum
from sys import get_int_max_str_digits
from typing import Any, assert_never

import chevron
import lxml.html
import prairielearn as pl
import prairielearn.sympy_utils as psu
import sympy
from prairielearn import set_expression
from sympy.printing.str import StrPrinter


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
DISPLAY_LOG_AS_LN_DEFAULT = False
DISPLAY_SIMPLIFIED_EXPRESSION_DEFAULT = True
IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT = "i"
ALLOW_TRIG_FUNCTIONS_DEFAULT = True
SIZE_DEFAULT = 35
SHOW_FORMULA_EDITOR_DEFAULT = False
SHOW_HELP_TEXT_DEFAULT = True
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = "{}"
PLACEHOLDER_DEFAULT = "set"
SHOW_SCORE_DEFAULT = True
INITIAL_VALUE_DEFAULT = None
SYNTAX_DEFAULT = set_expression.SetSyntax.TUPLE
SYMPY_TIMEOUT = 3

ELEMENT_DIR = pathlib.Path(__file__).parent
SCHEMA_PATH = ELEMENT_DIR / "schemas" / "pl-set-symbolic-input.json"
TEMPLATE_PATH = ELEMENT_DIR.parent / "pl-symbolic-input" / "pl-symbolic-input.mustache"


def _get_variables_with_fallback(
    element: lxml.html.HtmlElement,
    data: pl.QuestionData,
    name: str,
) -> list[str]:
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    if not pl.has_attrib(element, "variables"):
        correct_answer = data["correct_answers"].get(name, {})
        if isinstance(correct_answer, dict):
            variables = correct_answer.get("_variables", variables)
    return variables


def _get_parser_options(
    element: lxml.html.HtmlElement,
) -> tuple[list[str], bool, bool, bool, set_expression.SetSyntax]:
    custom_functions = psu.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
    )
    simplify_expression = pl.get_boolean_attrib(
        element,
        "display-simplified-expression",
        DISPLAY_SIMPLIFIED_EXPRESSION_DEFAULT,
    )
    syntax = pl.get_enum_attrib(
        element, "syntax", set_expression.SetSyntax, SYNTAX_DEFAULT
    )
    return custom_functions, allow_complex, allow_trig, simplify_expression, syntax


def _parse_set(
    value: str,
    variables: list[str],
    custom_functions: list[str],
    *,
    allow_complex: bool,
    allow_trig: bool,
    simplify_expression: bool,
    syntax: set_expression.SetSyntax,
    assumptions: psu.AssumptionsDictT | None = None,
    formula_editor: bool = False,
    formula_editor_latex: str | None = None,
) -> set_expression.SetParseSuccess:
    result = set_expression.try_parse_set_submission(
        value,
        variables,
        formula_editor=formula_editor,
        formula_editor_latex=formula_editor_latex,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig,
        custom_functions=custom_functions,
        simplify_expression=simplify_expression,
        assumptions=assumptions,
        syntax=syntax,
    )
    if isinstance(result, set_expression.SetParseFailure):
        raise ValueError(result.error)  # ruff:ignore[type-check-without-type-error]
    return result


def _deserialize_correct_answer(
    value: str | psu.SympyJson,
    variables: list[str],
    custom_functions: list[str],
    *,
    allow_complex: bool,
    allow_trig: bool,
    simplify_expression: bool,
    syntax: set_expression.SetSyntax,
) -> sympy.Set:
    if isinstance(value, str):
        result = _parse_set(
            value,
            variables,
            custom_functions,
            allow_complex=allow_complex,
            allow_trig=allow_trig,
            simplify_expression=simplify_expression,
            syntax=syntax,
        )
        return result.expr

    parsed = psu.json_to_sympy(
        value,
        allow_complex=allow_complex,
        allow_sets=True,
        allow_trig_functions=allow_trig,
        simplify_expression=simplify_expression,
    )
    if not isinstance(parsed, sympy.Set) or not set_expression.is_representable_set(
        parsed, syntax=syntax
    ):
        structured_values = (
            "tuples" if syntax is set_expression.SetSyntax.TUPLE else "intervals"
        )
        raise ValueError(
            "The correct answer must be a set representable with finite sets, "
            f"{structured_values}, named sets, union, intersection, or difference."
        )
    return parsed


def _replace_imaginary_for_display(
    expr: sympy.Basic, imaginary_unit: str
) -> sympy.Basic:
    return expr.subs(sympy.I, sympy.Symbol(imaginary_unit))


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.validate_element(element, SCHEMA_PATH)
    name = pl.get_string_attrib(element, "answers-name")
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions, allow_complex, allow_trig, simplify_expression, syntax = (
        _get_parser_options(element)
    )

    psu.validate_names_for_conflicts(
        name,
        variables,
        custom_functions,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig,
        allow_sets=False,
    )
    set_expression.validate_names(variables, custom_functions)
    pl.check_answers_names(data, name)

    if pl.has_attrib(element, "correct-answer"):
        if name in data["correct_answers"]:
            raise ValueError(f"duplicate correct_answers variable name: {name}")
        correct_answer = pl.get_string_attrib(element, "correct-answer")
        allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
        blank_value = pl.get_string_attrib(element, "blank-value", BLANK_VALUE_DEFAULT)
        if correct_answer.strip():
            try:
                _parse_set(
                    correct_answer,
                    variables,
                    custom_functions,
                    allow_complex=allow_complex,
                    allow_trig=allow_trig,
                    simplify_expression=simplify_expression,
                    syntax=syntax,
                )
            except ValueError as exc:
                raise ValueError(
                    f'Parsing correct answer "{correct_answer}" for "{name}" failed.'
                ) from exc
        elif not (allow_blank and blank_value == ""):
            raise ValueError(
                "Correct answer cannot be blank unless 'allow-blank' is true "
                "and 'blank-value' is empty."
            )
        data["correct_answers"][name] = correct_answer

    variables = _get_variables_with_fallback(element, data, name)
    correct_answer = data["correct_answers"].get(name)
    if correct_answer is not None and correct_answer != "":
        try:
            _deserialize_correct_answer(
                correct_answer,
                variables,
                custom_functions,
                allow_complex=allow_complex,
                allow_trig=allow_trig,
                simplify_expression=simplify_expression,
                syntax=syntax,
            )
        except (psu.BaseSympyError, ValueError) as exc:
            raise ValueError(f'Correct answer for "{name}" is not supported.') from exc

    formula_editor = pl.get_boolean_attrib(
        element, "formula-editor", SHOW_FORMULA_EDITOR_DEFAULT
    )
    initial_value = pl.get_string_attrib(
        element, "initial-value", INITIAL_VALUE_DEFAULT
    )
    if formula_editor and initial_value is not None and initial_value.strip():
        try:
            _parse_set(
                initial_value,
                variables,
                custom_functions,
                allow_complex=allow_complex,
                allow_trig=allow_trig,
                simplify_expression=simplify_expression,
                syntax=syntax,
            )
        except ValueError as exc:
            raise ValueError(
                f'Parsing initial value "{initial_value}" for "{name}" failed.'
            ) from exc

    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    if imaginary_unit not in {"i", "j"}:
        raise ValueError("imaginary-unit-for-display must be either i or j")


def _rendered_answer(
    value: str | psu.SympyJson,
    variables: list[str],
    custom_functions: list[str],
    *,
    allow_complex: bool,
    allow_trig: bool,
    simplify_expression: bool,
    syntax: set_expression.SetSyntax,
    imaginary_unit: str,
    display_log_as_ln: bool,
) -> sympy.Basic:
    parsed = _deserialize_correct_answer(
        value,
        variables,
        custom_functions,
        allow_complex=allow_complex,
        allow_trig=allow_trig,
        simplify_expression=simplify_expression,
        syntax=syntax,
    )
    displayed = _replace_imaginary_for_display(parsed, imaginary_unit)
    if display_log_as_ln:
        displayed = displayed.replace(sympy.log, sympy.Function("ln"))
    return displayed


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    label = pl.get_string_attrib(element, "label", LABEL_DEFAULT)
    aria_label = pl.get_string_attrib(element, "aria-label", ARIA_LABEL_DEFAULT)
    suffix = pl.get_string_attrib(element, "suffix", SUFFIX_DEFAULT)
    variables = _get_variables_with_fallback(element, data, name)
    custom_functions, allow_complex, allow_trig, simplify_expression, syntax = (
        _get_parser_options(element)
    )
    display = pl.get_enum_attrib(element, "display", DisplayType, DISPLAY_DEFAULT)
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    display_log_as_ln = pl.get_boolean_attrib(
        element, "display-log-as-ln", DISPLAY_LOG_AS_LN_DEFAULT
    )
    size = pl.get_integer_attrib(element, "size", SIZE_DEFAULT)
    placeholder = pl.get_string_attrib(element, "placeholder", PLACEHOLDER_DEFAULT)
    show_score = pl.get_boolean_attrib(element, "show-score", SHOW_SCORE_DEFAULT)
    show_info = pl.get_boolean_attrib(element, "show-help-text", SHOW_HELP_TEXT_DEFAULT)

    structured_operators = (
        ["( , )"] if syntax is set_expression.SetSyntax.TUPLE else ["[ , ]", "( , )"]
    )
    operators = [
        "{ }",
        *structured_operators,
        "U",
        "cup",
        "∪",  # ruff:ignore[ambiguous-unicode-character-string]
        "|",
        "+",
        "cap",
        "∩",
        "&",
        "-",
        *custom_functions,
        *sorted(
            psu.get_builtin_callable_functions(
                allow_trig_functions=allow_trig,
                allow_sets=False,
                include_helpers=False,
            )
        ),
    ]
    constants = sorted(psu.get_builtin_constants(allow_hidden=False))
    info_params = {
        "format": True,
        "set_input": True,
        "variables": variables,
        "operators": operators,
        "constants": constants,
        "allow_complex": allow_complex,
        "tuple_syntax": syntax is set_expression.SetSyntax.TUPLE,
        "interval_syntax": syntax is set_expression.SetSyntax.INTERVAL,
    }
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    info = chevron.render(template, info_params).strip()

    parse_error: str | None = data["format_errors"].get(name)
    missing_input = False
    converted_submission: str | None = None
    if parse_error is None and name in data["submitted_answers"]:
        submitted = data["submitted_answers"][name]
        if submitted == "":
            converted_submission = ""
        elif isinstance(submitted, str):
            converted_submission = sympy.latex(
                _rendered_answer(
                    submitted,
                    variables,
                    custom_functions,
                    allow_complex=allow_complex,
                    allow_trig=allow_trig,
                    simplify_expression=simplify_expression,
                    syntax=syntax,
                    imaginary_unit=imaginary_unit,
                    display_log_as_ln=display_log_as_ln,
                )
            )
        else:
            parsed_submission = psu.json_to_sympy(
                submitted,
                allow_complex=allow_complex,
                allow_sets=True,
                allow_trig_functions=allow_trig,
                simplify_expression=simplify_expression,
            )
            displayed_submission = _replace_imaginary_for_display(
                parsed_submission, imaginary_unit
            )
            if display_log_as_ln:
                displayed_submission = displayed_submission.replace(
                    sympy.log, sympy.Function("ln")
                )
            converted_submission = sympy.latex(displayed_submission)
    elif name not in data["submitted_answers"]:
        missing_input = True
        parse_error = None
    elif parse_error is not None:
        parse_error += chevron.render(
            template, {"format_error": True, "format_string": info}
        ).strip()

    formula_editor = pl.get_boolean_attrib(
        element, "formula-editor", SHOW_FORMULA_EDITOR_DEFAULT
    )
    initial_value = pl.get_string_attrib(
        element, "initial-value", INITIAL_VALUE_DEFAULT
    )
    raw_latex = data["raw_submitted_answers"].get(name + "-latex")
    raw_answer = data["raw_submitted_answers"].get(name)
    if raw_answer is None:
        raw_answer = initial_value
    if (
        raw_latex is None
        and formula_editor
        and initial_value is not None
        and initial_value.strip()
    ):
        raw_latex = sympy.latex(
            _rendered_answer(
                initial_value,
                variables,
                custom_functions,
                allow_complex=allow_complex,
                allow_trig=allow_trig,
                simplify_expression=simplify_expression,
                syntax=syntax,
                imaginary_unit=imaginary_unit,
                display_log_as_ln=display_log_as_ln,
            )
        )

    score = data["partial_scores"].get(name, {}).get("score")
    common_params = {
        "label": label,
        "suffix": suffix,
        "uuid": pl.get_uuid(),
        "formula_editor": formula_editor,
        "custom_functions": ",".join(custom_functions),
        "allow_trig": allow_trig,
        "allow_sets": True,
        "named_sets": True,
        "set_syntax": syntax.value,
        "imaginary_unit": imaginary_unit,
        "log_as_ln": display_log_as_ln,
        display.value: True,
    }

    if data["panel"] == "question":
        html_params = {
            **common_params,
            "question": True,
            "name": name,
            "aria_label": aria_label,
            "editable": data["editable"],
            "info": info,
            "placeholder": placeholder,
            "size": size,
            "show_info": show_info,
            "allow_complex": allow_complex,
            "raw_submitted_answer": raw_answer,
            "raw_submitted_answer_latex": raw_latex,
            "parse_error": parse_error,
        }
        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value
        return chevron.render(template, html_params).strip()

    if data["panel"] == "submission":
        html_params = {
            **common_params,
            "submission": True,
            "parse_error": parse_error,
            "a_sub": converted_submission,
            "raw_submitted_answer": raw_answer,
            "raw_submitted_answer_latex": raw_latex,
            "error": parse_error or missing_input,
            "missing_input": missing_input,
        }
        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value
        return chevron.render(template, html_params).strip()

    if data["panel"] == "answer":
        correct_answer = data["correct_answers"].get(name)
        if correct_answer is None:
            return ""
        if correct_answer == "":
            answer_latex = ""
        else:
            answer_latex = sympy.latex(
                _rendered_answer(
                    correct_answer,
                    variables,
                    custom_functions,
                    allow_complex=allow_complex,
                    allow_trig=allow_trig,
                    simplify_expression=simplify_expression,
                    syntax=syntax,
                    imaginary_unit=imaginary_unit,
                    display_log_as_ln=display_log_as_ln,
                )
            )
        return chevron.render(
            template,
            {
                **common_params,
                "answer": True,
                "a_tru": answer_latex,
            },
        ).strip()

    assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = _get_variables_with_fallback(element, data, name)
    custom_functions, allow_complex, allow_trig, simplify_expression, syntax = (
        _get_parser_options(element)
    )
    formula_editor = pl.get_boolean_attrib(
        element, "formula-editor", SHOW_FORMULA_EDITOR_DEFAULT
    )
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    blank_value = pl.get_string_attrib(element, "blank-value", BLANK_VALUE_DEFAULT)

    submission = data["submitted_answers"].get(name)
    latex = data["raw_submitted_answers"].get(name + "-latex")
    if submission is None:
        data["format_errors"][name] = "No submitted answer."
        data["submitted_answers"][name] = None
        return
    if not submission.strip():
        if not allow_blank:
            data["format_errors"][name] = "No submitted answer."
            data["submitted_answers"][name] = None
            return
        if not blank_value.strip():
            data["submitted_answers"][name] = ""
            return
        submission = blank_value
        formula_editor = False
        latex = None

    assumptions = None
    correct_answer = data["correct_answers"].get(name)
    if isinstance(correct_answer, dict):
        assumptions = correct_answer.get("_assumptions")

    result = set_expression.try_parse_set_submission(
        submission,
        variables,
        formula_editor=formula_editor,
        formula_editor_latex=latex,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig,
        custom_functions=custom_functions,
        simplify_expression=simplify_expression,
        assumptions=assumptions,
        syntax=syntax,
    )
    if isinstance(result, set_expression.SetParseFailure):
        data["format_errors"][name] = result.error
        data["submitted_answers"][name] = None
        return
    data["submitted_answers"][name] = result.json


def _sympy_values_equal(a: sympy.Basic, b: sympy.Basic) -> bool:
    if isinstance(a, sympy.Set) and isinstance(b, sympy.Set):
        if a == b:
            return True
        a = a.doit(deep=True)
        b = b.doit(deep=True)

    comparison_cache: dict[tuple[sympy.Basic, sympy.Basic], bool] = {}

    def compare(left: sympy.Basic, right: sympy.Basic) -> bool:
        pair = (left, right)
        if pair in comparison_cache:
            return comparison_cache[pair]
        reverse_pair = (right, left)
        if reverse_pair in comparison_cache:
            return comparison_cache[reverse_pair]

        if left is right or left == right:
            result = True
        elif type(left) is type(right) and isinstance(
            left, (sympy.FiniteSet, sympy.Union, sympy.Intersection)
        ):
            result = all(
                any(compare(value, candidate) for candidate in right.args)
                for value in left.args
            ) and all(
                any(compare(value, candidate) for candidate in left.args)
                for value in right.args
            )
        elif isinstance(left, sympy.Interval) and isinstance(right, sympy.Interval):
            result = (
                left.left_open == right.left_open
                and left.right_open == right.right_open
                and compare(left.start, right.start)
                and compare(left.end, right.end)
            )
        elif isinstance(left, sympy.Tuple) and isinstance(right, sympy.Tuple):
            result = len(left) == len(right) and all(
                compare(left_coordinate, right_coordinate)
                for left_coordinate, right_coordinate in zip(left, right, strict=True)
            )
        elif isinstance(left, sympy.Complement) and isinstance(right, sympy.Complement):
            result = len(left.args) == len(right.args) and all(
                compare(left_arg, right_arg)
                for left_arg, right_arg in zip(left.args, right.args, strict=True)
            )
        elif isinstance(left, (sympy.Expr, sympy.logic.boolalg.Boolean)) and isinstance(
            right, (sympy.Expr, sympy.logic.boolalg.Boolean)
        ):
            result = left.equals(right) is True
        else:
            result = False

        comparison_cache[pair] = result
        comparison_cache[reverse_pair] = result
        return result

    return compare(a, b)


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = _get_variables_with_fallback(element, data, name)
    custom_functions, allow_complex, allow_trig, simplify_expression, syntax = (
        _get_parser_options(element)
    )
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    correct_answer = data["correct_answers"].get(name)
    if correct_answer is None:
        return

    def grade_function(submission: str | psu.SympyJson | None) -> tuple[bool, None]:
        if submission is None:
            return False, None
        if correct_answer == "" or submission == "":
            return correct_answer == submission, None

        correct_sympy = _deserialize_correct_answer(
            correct_answer,
            variables,
            custom_functions,
            allow_complex=allow_complex,
            allow_trig=allow_trig,
            simplify_expression=simplify_expression,
            syntax=syntax,
        )
        if isinstance(submission, str):
            submitted_sympy = _parse_set(
                submission,
                variables,
                custom_functions,
                allow_complex=allow_complex,
                allow_trig=allow_trig,
                simplify_expression=simplify_expression,
                syntax=syntax,
            ).expr
        else:
            submitted_sympy = psu.json_to_sympy(
                submission,
                allow_complex=allow_complex,
                allow_sets=True,
                allow_trig_functions=allow_trig,
                simplify_expression=simplify_expression,
            )
        return _sympy_values_equal(correct_sympy, submitted_sympy), None

    try:
        pl.grade_answer_parameterized(
            data,
            name,
            grade_function,
            weight=weight,
            timeout=SYMPY_TIMEOUT,
            timeout_format_error="Your answer did not converge, try a simpler expression.",
        )
    except ValueError as exc:
        if "integer string conversion" in str(exc):
            data["format_errors"][name] = (
                f"Your expression expands integers longer than "
                f"{get_int_max_str_digits()} digits, try a simpler expression."
            )
        else:
            raise


class _TestSubmissionPrinter(StrPrinter):
    def __init__(self, imaginary_unit: str) -> None:
        super().__init__()
        self._constant_names = {sympy.E: "e", sympy.I: imaginary_unit}

    def _print(self, expr: Any, **kwargs: Any) -> str:
        if isinstance(expr, sympy.Basic) and expr in self._constant_names:
            return self._constant_names[expr]
        return super()._print(expr, **kwargs)

    def _print_EmptySet(self, expr: sympy.Set) -> str:  # pyright: ignore[reportIncompatibleMethodOverride] # ruff:ignore[unused-method-argument, invalid-function-name]
        return "{}"

    def _print_Interval(self, i: sympy.Interval) -> str:  # ruff:ignore[invalid-function-name]
        left = "(" if i.left_open else "["
        right = ")" if i.right_open else "]"
        return f"{left}{self._print(i.start)}, {self._print(i.end)}{right}"

    def _print_Tuple(self, expr: sympy.Tuple) -> str:  # ruff:ignore[invalid-function-name]
        return f"({', '.join(self._print(item) for item in expr)})"

    def _print_Union(self, value: sympy.Union) -> str:  # ruff:ignore[invalid-function-name]
        return " U ".join(self._print(item) for item in value.args)

    def _print_Intersection(self, value: sympy.Intersection) -> str:  # ruff:ignore[invalid-function-name]
        return " cap ".join(self._print(item) for item in value.args)

    def _print_Complement(self, value: sympy.Complement) -> str:  # ruff:ignore[invalid-function-name]
        return f"({self._print(value.args[0])}) - ({self._print(value.args[1])})"

    def _print_Reals(self, expr: sympy.Set) -> str:  # pyright: ignore[reportIncompatibleMethodOverride] # ruff:ignore[unused-method-argument, invalid-function-name]
        return "R"

    def _print_Rationals(self, expr: sympy.Set) -> str:  # pyright: ignore[reportIncompatibleMethodOverride] # ruff:ignore[unused-method-argument, invalid-function-name]
        return "Q"

    def _print_Integers(self, expr: sympy.Set) -> str:  # pyright: ignore[reportIncompatibleMethodOverride] # ruff:ignore[unused-method-argument, invalid-function-name]
        return "Z"

    def _print_Naturals(self, expr: sympy.Set) -> str:  # pyright: ignore[reportIncompatibleMethodOverride] # ruff:ignore[unused-method-argument, invalid-function-name]
        return "N"

    def _print_Complexes(self, expr: sympy.Set) -> str:  # pyright: ignore[reportIncompatibleMethodOverride] # ruff:ignore[unused-method-argument, invalid-function-name]
        return "C"


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions, allow_complex, allow_trig, simplify_expression, syntax = (
        _get_parser_options(element)
    )
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    result = data["test_type"]
    correct_string = ""

    if result in {"correct", "incorrect"}:
        correct_answer = data["correct_answers"].get(name)
        if correct_answer is None:
            return
        if correct_answer != "":
            correct_sympy = _deserialize_correct_answer(
                correct_answer,
                variables,
                custom_functions,
                allow_complex=allow_complex,
                allow_trig=allow_trig,
                simplify_expression=simplify_expression,
                syntax=syntax,
            )
            correct_string = _TestSubmissionPrinter(imaginary_unit).doprint(
                correct_sympy
            )

    if result == "correct":
        data["raw_submitted_answers"][name] = correct_string
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    elif result == "incorrect":
        data["raw_submitted_answers"][name] = f"{{{random.randint(1, 100)}}}"
        data["partial_scores"][name] = {"score": 0, "weight": weight}
    elif result == "invalid":
        data["raw_submitted_answers"][name] = "x + 1"
        data["format_errors"][name] = ""
    else:
        assert_never(result)
