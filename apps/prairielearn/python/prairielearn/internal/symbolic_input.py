"""Internal helpers shared by symbolic-input elements."""

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from enum import Enum
from functools import lru_cache
from typing import Literal, assert_never

import chevron
import sympy

import prairielearn.sympy_utils as psu
from prairielearn.grading_utils import determine_score_params
from prairielearn.misc_utils import get_uuid
from prairielearn.question_utils import QuestionData


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"


@dataclass(frozen=True, slots=True)
class SymbolicSubmissionParseSuccess:
    expr: psu.SympyValue | Literal[""]
    json: psu.SympyJson | Literal[""]


type SymbolicSubmissionParseResult = (
    SymbolicSubmissionParseSuccess | psu.SympyParseFailure
)


def allowed_sympy_types_include_sets(
    allowed_types: set[psu.AllowedSympyType],
) -> bool:
    return not allowed_types.isdisjoint({"all", "set", "finite-set", "interval"})


def _format_submission_for_sympy(
    submission: str, *, allow_sets: bool = False
) -> tuple[str | None, str | None]:
    """Replace absolute-value bars with syntax understood by the SymPy parser."""
    original_submission = submission
    # The formula editor writes \lvert, \rvert and \mid as U+2223 (DIVIDES).
    submission = submission.replace("\u2223", "|")

    pattern = re.compile(
        r"(\|\s*[a-zA-Z0-9(+\-]([^|]*[a-zA-Z0-9!)])\s*\|)|(\|\s*[a-zA-Z0-9]\s*\|)"
    )
    bar_pattern = re.compile(r"\|")
    search_from = 0
    preceding_bars: list[int] = []
    while match := pattern.search(submission, search_from):
        preceding_bars.extend(
            bar_match.start()
            for bar_match in bar_pattern.finditer(
                submission, search_from, match.start()
            )
        )

        content = match.group(0)[1:-1]
        if allow_sets and "," in content:
            preceding_bars.append(match.start())
            search_from = match.start() + 1
            continue

        submission = (
            submission[: match.start()] + f"abs({content})" + submission[match.end() :]
        )
        search_from = preceding_bars.pop() if preceding_bars else match.start()

    if not allow_sets and "|" in submission:
        error = f"The absolute value bars in your answer are mismatched or ambiguous: <code>{original_submission}</code>."
        return (
            None,
            error,
        )

    return submission, None


_PLUS_MINUS_LATEX_PATTERN = re.compile(r"\\pm(?![a-zA-Z])|\+[{}]*-")


def _restore_plus_minus(submission: str, latex: str) -> str | None:
    r"""Restore formula-editor ``\pm`` tokens without changing typed ``+-``."""
    from_plus_minus = [
        match.group(0).startswith("\\")
        for match in _PLUS_MINUS_LATEX_PATTERN.finditer(latex)
    ]
    parts = submission.split("+-")
    if len(parts) - 1 != len(from_plus_minus):
        return None
    if not any(from_plus_minus):
        return submission

    result = [parts[0]]
    for is_plus_minus, part in zip(from_plus_minus, parts[1:], strict=True):
        result.extend(("±" if is_plus_minus else "+-", part))
    return "".join(result)


def _format_formula_editor_submission_for_sympy(
    submission: str,
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    allow_trig_functions: bool,
    allow_sets: bool = False,
    latex: str | None = None,
) -> str | None:
    """Normalize formula-editor output before parsing it with SymPy."""
    text = submission if latex is None else _restore_plus_minus(submission, latex)
    if text is None:
        return None

    text = text.replace("{:", "").replace(":}", "")
    text = text.replace("-:", "/").replace(" ** ", " * ")
    known_tokens = _build_formula_editor_tokens(
        variables,
        custom_functions,
        allow_trig_functions=allow_trig_functions,
        allow_sets=allow_sets,
    )
    text = "".join(_format_formula_editor_greek_character(char) for char in text)
    text = _merge_formula_editor_tokens(text, known_tokens)
    text = _add_formula_editor_multiplication_spaces(text, known_tokens)

    function_names = frozenset(
        psu.greek_unicode_transform(name)
        for name in (
            psu.get_builtin_callable_functions(
                allow_trig_functions=allow_trig_functions,
                allow_sets=allow_sets,
            )
            | set(custom_functions)
        )
    )
    return _wrap_bare_function_arguments(text, function_names)


def _build_formula_editor_tokens(
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    allow_trig_functions: bool,
    allow_sets: bool = False,
) -> list[str]:
    tokens = (
        list(psu.STANDARD_OPERATORS)
        + list(
            psu.get_builtin_functions(
                allow_trig_functions=allow_trig_functions,
                allow_sets=allow_sets,
            )
        )
        + list(custom_functions)
        + list(variables)
    )
    tokens += [
        psu.greek_unicode_transform(token)
        for token in tokens
        if psu.greek_unicode_transform(token) != token
    ]
    return [token for token in tokens if len(token) > 1 and token != "**"]


def _format_formula_editor_greek_character(character: str) -> str:
    transformed = psu.greek_unicode_transform(character)
    return " " + " ".join(transformed) + " " if transformed != character else character


def _merge_formula_editor_tokens(text: str, tokens: Sequence[str]) -> str:
    result: list[str] = []
    index = 0
    spaced_tokens = sorted(
        ((token, " ".join(token)) for token in tokens),
        key=lambda item: -len(item[1]),
    )
    while index < len(text):
        for token, spaced_token in spaced_tokens:
            if text.startswith(spaced_token, index):
                result.append(token)
                index += len(spaced_token)
                break
        else:
            result.append(text[index])
            index += 1
    return "".join(result)


def _add_formula_editor_multiplication_spaces(
    text: str, protected_tokens: Sequence[str]
) -> str:
    protected_positions: set[int] = set()
    for token in protected_tokens:
        if not re.search(r"\d", token):
            continue
        for match in re.finditer(re.escape(token), text):
            protected_positions.update(range(match.start(), match.end()))

    result: list[str] = []
    for index, character in enumerate(text):
        result.append(character)
        if (
            index + 1 < len(text)
            and character.isalpha()
            and text[index + 1].isdigit()
            and index + 1 not in protected_positions
        ):
            result.append(" ")
    return "".join(result)


_TRAILING_IDENTIFIER_PATTERN = re.compile(r"[A-Za-z_]\w*$")


def _is_implicit_multiplication_paren(
    text: str,
    argument_start: int,
    argument_end: int,
    function_names: frozenset[str],
) -> bool:
    if argument_end == argument_start:
        return False

    name_start = argument_end
    while name_start > argument_start and (
        text[name_start - 1].isalnum() or text[name_start - 1] == "_"
    ):
        name_start -= 1
    name = _TRAILING_IDENTIFIER_PATTERN.search(text, name_start, argument_end)
    if name is not None:
        return name.group(0) not in function_names
    if text[argument_end - 1].isdigit():
        return True
    return text[argument_end - 1] in ")]}"


@lru_cache(maxsize=128)
def _bare_function_token_pattern(function_names: frozenset[str]) -> re.Pattern[str]:
    names = sorted(function_names, key=len, reverse=True)
    return re.compile(
        r"(?P<function>(?<![A-Za-z_])(?:"
        + "|".join(map(re.escape, names))
        + r")\s+(?=[^\s(]))|(?P<token>\*+|[()\[\]{}+\-/,])"
    )


def _wrap_bare_function_arguments(text: str, function_names: frozenset[str]) -> str:
    """Parenthesize bare function arguments that end at multiplication."""
    if not function_names:
        return text
    pattern = _bare_function_token_pattern(function_names)

    insertions: list[tuple[int, str]] = []
    pending_arguments: dict[int, int] = {}
    depth = 0
    for match in pattern.finditer(text):
        if match.lastgroup == "function":
            pending_arguments.setdefault(depth, match.end())
            continue

        token = match.group(0)
        match token:
            case "(" | "*":
                start = pending_arguments.get(depth)
                if start is not None:
                    argument_end = match.start()
                    while argument_end > start and text[argument_end - 1].isspace():
                        argument_end -= 1
                    if token == "*" or _is_implicit_multiplication_paren(
                        text, start, argument_end, function_names
                    ):
                        pending_arguments.pop(depth)
                        insertions.extend(((start, "("), (argument_end, ")")))
                if token == "(":
                    depth += 1
            case "[" | "{":
                depth += 1
            case ")" | "]" | "}":
                pending_arguments.pop(depth, None)
                depth -= 1
            case "+" | "-" | "/" | ",":
                pending_arguments.pop(depth, None)
            case _:
                pass

    result: list[str] = []
    position = 0
    for index, parenthesis in sorted(insertions):
        result.extend((text[position:index], parenthesis))
        position = index
    result.append(text[position:])
    return "".join(result)


def try_parse_symbolic_submission(
    submission: str | None,
    variables: Iterable[str] | None,
    *,
    formula_editor: bool = False,
    formula_editor_latex: str | None = None,
    allow_blank: bool = False,
    blank_value: str = "0",
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: Sequence[str] = (),
    imaginary_unit: str | None = None,
    simplify_expression: bool = True,
    assumptions: psu.AssumptionsDictT | None = None,
    allowed_types: set[psu.AllowedSympyType] | None = None,
) -> SymbolicSubmissionParseResult:
    """Normalize, parse, and serialize a symbolic-input submission."""
    if allowed_types is None:
        allowed_types = {"all"}
    allow_sets = allowed_sympy_types_include_sets(allowed_types)
    variable_list = list(variables or ())
    custom_function_list = list(custom_functions)
    if formula_editor and submission is not None:
        formatted_submission = _format_formula_editor_submission_for_sympy(
            submission,
            variable_list,
            custom_function_list,
            allow_trig_functions=allow_trig_functions,
            allow_sets=allow_sets,
            latex=formula_editor_latex,
        )
        if formatted_submission is None:
            return psu.SympyParseFailure(psu.SYMPY_PARSE_ERROR_WITHOUT_LOCATION)
        submission = formatted_submission
    if submission is None:
        return psu.SympyParseFailure("No submitted answer.")
    formatted_submission, error = _format_submission_for_sympy(
        submission, allow_sets=allow_sets
    )
    if error is not None:
        return psu.SympyParseFailure(error)
    assert formatted_submission is not None
    if not formatted_submission.strip():
        if not allow_blank:
            return psu.SympyParseFailure("No submitted answer.")
        formatted_submission = blank_value
        if not formatted_submission.strip():
            return SymbolicSubmissionParseSuccess("", "")

    result = psu.try_parse_string_as_sympy(
        formatted_submission,
        variable_list,
        allow_hidden=True,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
        imaginary_unit=imaginary_unit,
        custom_functions=custom_function_list,
        simplify_expression=simplify_expression,
        assumptions=assumptions,
        allowed_types=allowed_types,
    )
    if isinstance(result, psu.SympyParseFailure):
        return result

    try:
        submission_json = psu.sympy_to_json(
            result.expr,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
        )
        psu.json_to_sympy(
            submission_json,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            simplify_expression=simplify_expression,
        )
    except Exception:
        return psu.SympyParseFailure(
            "Your answer was simplified to this, which contains an invalid expression: "
            f"$${sympy.latex(result.expr)}$$"
        )
    return SymbolicSubmissionParseSuccess(result.expr, submission_json)


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
        return allowed_sympy_types_include_sets(self.allowed_types)


def replace_imaginary_for_display(
    expr: psu.SympyValue, imaginary_unit: str
) -> sympy.Basic:
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
