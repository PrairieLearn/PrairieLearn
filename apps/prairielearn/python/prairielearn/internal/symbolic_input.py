"""Internal parsing helpers shared by symbolic-input elements."""

import re
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

import sympy

import prairielearn.sympy_utils as psu


@dataclass(frozen=True, slots=True)
class SourceText:
    """Text whose character offsets refer to positions in the raw source."""

    text: str
    offsets: tuple[int, ...]

    def __post_init__(self) -> None:
        """Validate that the text and source map stay aligned."""
        if len(self.text) != len(self.offsets):
            raise ValueError("SourceText must have one source offset per character")

    def __iter__(self) -> Iterator[tuple[int, str]]:
        """Iterate over the raw source offsets of each char."""
        return zip(self.offsets, self.text, strict=True)

    @classmethod
    def from_text(cls, text: str) -> "SourceText":
        return cls(text, tuple(range(len(text))))


@dataclass(frozen=True, slots=True)
class SymbolicInputNormalizationError(Exception):
    message: str


@dataclass(frozen=True, slots=True)
class SymbolicSubmissionParseSuccess:
    expr: sympy.Expr | Literal[""]
    json: psu.SympyJson | Literal[""]


type SymbolicInputNormalizationResult = SourceText | psu.SympyParseFailure
type SymbolicSubmissionParseResult = (
    SymbolicSubmissionParseSuccess | psu.SympyParseFailure
)


_PLUS_MINUS_LATEX_PATTERN = re.compile(r"\\pm(?![a-zA-Z])|\+[{}]*-")


def _restore_plus_minus_source(source: SourceText, latex: str) -> SourceText | None:
    r"""Restore formula-editor ``+-`` sequences that came from ``\pm``."""
    from_plus_minus = [
        match.group(0).startswith("\\")
        for match in _PLUS_MINUS_LATEX_PATTERN.finditer(latex)
    ]
    matches = list(re.finditer(r"\+-", source.text))
    if len(matches) != len(from_plus_minus):
        return None
    if not any(from_plus_minus):
        return source

    parts: list[str] = []
    offsets: list[int] = []
    last_end = 0
    for match, is_plus_minus in zip(matches, from_plus_minus, strict=True):
        parts.append(source.text[last_end : match.start()])
        offsets.extend(source.offsets[last_end : match.start()])
        if is_plus_minus:
            parts.append("±")
            offsets.append(source.offsets[match.start()])
        else:
            parts.append(match.group(0))
            offsets.extend(source.offsets[match.start() : match.end()])
        last_end = match.end()
    parts.append(source.text[last_end:])
    offsets.extend(source.offsets[last_end:])
    return SourceText("".join(parts), tuple(offsets))


def _delete_literal(source: SourceText, literal: str) -> SourceText:
    parts: list[str] = []
    offsets: list[int] = []
    last_end = 0
    for match in re.finditer(re.escape(literal), source.text):
        parts.append(source.text[last_end : match.start()])
        offsets.extend(source.offsets[last_end : match.start()])
        last_end = match.end()
    parts.append(source.text[last_end:])
    offsets.extend(source.offsets[last_end:])
    return SourceText("".join(parts), tuple(offsets))


def _replace_editor_operators(source: SourceText, raw_text: str) -> SourceText:
    parts: list[str] = []
    offsets: list[int] = []
    index = 0
    while index < len(source.text):
        if source.text.startswith("-:", index):
            parts.append("/")
            offsets.append(source.offsets[index])
            index += 2
            continue
        if source.text.startswith(" ** ", index):
            left_star_offset = source.offsets[index + 1]
            right_star_offset = source.offsets[index + 2]
            if raw_text[left_star_offset] == "*" and raw_text[right_star_offset] == "*":
                parts.append(" * ")
                offsets.extend((
                    source.offsets[index],
                    left_star_offset,
                    source.offsets[index + 3],
                ))
                index += 4
                continue
        parts.append(source.text[index])
        offsets.append(source.offsets[index])
        index += 1
    return SourceText("".join(parts), tuple(offsets))


def _build_formula_editor_tokens(
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    allow_trig_functions: bool,
) -> list[str]:
    tokens = (
        list(psu.STANDARD_OPERATORS)
        + list(psu._Constants.functions)
        + list(custom_functions)
        + list(variables)
    )
    if allow_trig_functions:
        tokens += list(psu._Constants.trig_functions)
    tokens += [
        psu.greek_unicode_transform(token)
        for token in tokens
        if psu.greek_unicode_transform(token) != token
    ]
    return [token for token in tokens if len(token) > 1 and token != "**"]


def _merge_spaced_source(source: SourceText, tokens: Sequence[str]) -> SourceText:
    spaced = [(token, " ".join(token)) for token in tokens]
    spaced.sort(key=lambda item: -len(item[1]))

    parts: list[str] = []
    offsets: list[int] = []
    index = 0
    while index < len(source.text):
        for token, spaced_token in spaced:
            if source.text.startswith(spaced_token, index):
                parts.append(token)
                offsets.extend(
                    source.offsets[index + char_index * 2]
                    for char_index in range(len(token))
                )
                index += len(spaced_token)
                break
        else:
            parts.append(source.text[index])
            offsets.append(source.offsets[index])
            index += 1
    return SourceText("".join(parts), tuple(offsets))


def _add_multiplication_spaces_source(
    source: SourceText, protected_tokens: Sequence[str]
) -> SourceText:
    protected_positions: set[int] = set()
    for token in protected_tokens:
        if not re.search(r"\d", token):
            continue
        for match in re.finditer(re.escape(token), source.text):
            protected_positions.update(range(match.start(), match.end()))

    parts: list[str] = []
    offsets: list[int] = []
    for index, character in enumerate(source.text):
        parts.append(character)
        offsets.append(source.offsets[index])
        if index + 1 >= len(source.text):
            continue
        if (
            character.isalpha()
            and source.text[index + 1].isdigit()
            and index + 1 not in protected_positions
        ):
            parts.append(" ")
            offsets.append(source.offsets[index + 1])
    return SourceText("".join(parts), tuple(offsets))


@lru_cache(maxsize=128)
def _bare_function_token_pattern(function_names: frozenset[str]) -> re.Pattern[str]:
    names = sorted(function_names, key=len, reverse=True)
    return re.compile(
        r"(?P<function>(?<![A-Za-z_])(?:"
        + "|".join(map(re.escape, names))
        + r")\s+(?=[^\s(]))|(?P<token>\*+|[()\[\]{}+\-/,])"
    )


def _wrap_bare_function_arguments_source(
    source: SourceText, function_names: frozenset[str]
) -> SourceText:
    if not function_names:
        return source
    pattern = _bare_function_token_pattern(function_names)
    insertions: list[tuple[int, str, int]] = []
    pending_arguments: dict[int, int] = {}
    depth = 0
    for match in pattern.finditer(source.text):
        if match.lastgroup == "function":
            pending_arguments.setdefault(depth, match.end())
            continue

        token = match.group(0)
        match token:
            case "(" | "[" | "{":
                depth += 1
            case ")" | "]" | "}":
                pending_arguments.pop(depth, None)
                depth -= 1
            case "*":
                start = pending_arguments.pop(depth, None)
                if start is not None:
                    argument_start = start
                    while (
                        argument_start < match.start()
                        and source.text[argument_start].isspace()
                    ):
                        argument_start += 1
                    argument_end = match.start()
                    while (
                        argument_end > argument_start
                        and source.text[argument_end - 1].isspace()
                    ):
                        argument_end -= 1
                    open_offset = source.offsets[
                        min(argument_start, len(source.offsets) - 1)
                    ]
                    close_offset = source.offsets[max(argument_end - 1, 0)]
                    insertions.extend((
                        (start, "(", open_offset),
                        (argument_end, ")", close_offset),
                    ))
            case "+" | "-" | "/" | ",":
                pending_arguments.pop(depth, None)
            case _:
                pass

    parts: list[str] = []
    offsets: list[int] = []
    position = 0
    for index, parenthesis, offset in sorted(insertions):
        parts.extend((source.text[position:index], parenthesis))
        offsets.extend(source.offsets[position:index])
        offsets.append(offset)
        position = index
    parts.append(source.text[position:])
    offsets.extend(source.offsets[position:])
    return SourceText("".join(parts), tuple(offsets))


def _format_formula_editor_source(
    source: SourceText,
    raw_text: str,
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    allow_trig_functions: bool,
) -> SourceText:
    source = _delete_literal(_delete_literal(source, "{:"), ":}")
    source = _replace_editor_operators(source, raw_text)
    known_tokens = _build_formula_editor_tokens(
        variables,
        custom_functions,
        allow_trig_functions=allow_trig_functions,
    )
    source = _merge_spaced_source(source, known_tokens)
    source = _add_multiplication_spaces_source(source, known_tokens)
    function_names = frozenset(
        psu.get_builtin_functions(allow_trig_functions=allow_trig_functions)
        | set(custom_functions)
    )
    return _wrap_bare_function_arguments_source(source, function_names)


_ABSOLUTE_VALUE_PATTERN = re.compile(
    r"(\|\s*[a-zA-Z0-9(+\-]([^|]*[a-zA-Z0-9!)])\s*\|)|(\|\s*[a-zA-Z0-9]\s*\|)"
)


def _convert_absolute_values_source(
    source: SourceText, *, allow_sets: bool
) -> SourceText:
    original_text = source.text
    search_from = 0
    while match := _ABSOLUTE_VALUE_PATTERN.search(source.text, search_from):
        content = source.text[match.start() + 1 : match.end() - 1]
        if allow_sets and "," in content:
            search_from = match.start() + 1
            continue

        opening_offset = source.offsets[match.start()]
        closing_offset = source.offsets[match.end() - 1]
        replacement = f"abs({content})"
        replacement_offsets = (
            (opening_offset,) * 4
            + source.offsets[match.start() + 1 : match.end() - 1]
            + (closing_offset,)
        )
        source = SourceText(
            source.text[: match.start()] + replacement + source.text[match.end() :],
            source.offsets[: match.start()]
            + replacement_offsets
            + source.offsets[match.end() :],
        )
        search_from = 0

    if not allow_sets and "|" in source.text:
        raise SymbolicInputNormalizationError(
            f"The absolute value bars in your answer are mismatched or ambiguous: <code>{original_text}</code>."
        )
    return source


def normalize_symbolic_input(
    text: str,
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    formula_editor: bool,
    latex: str | None,
    allow_trig_functions: bool,
    allow_complex: bool,
    allow_sets: bool,
) -> SourceText:
    """Normalize a symbolic-input submission in its required transformation order."""
    source = psu._normalize_unicode_source(
        SourceText.from_text(text), formula_editor=formula_editor
    )
    if formula_editor:
        if latex is not None:
            restored = _restore_plus_minus_source(source, latex)
            if restored is None:
                raise SymbolicInputNormalizationError(
                    psu.SYMPY_PARSE_ERROR_WITHOUT_LOCATION
                )
            source = restored
        source = _format_formula_editor_source(
            source,
            text,
            variables,
            custom_functions,
            allow_trig_functions=allow_trig_functions,
        )
    source = _convert_absolute_values_source(source, allow_sets=allow_sets)
    return psu._validate_and_rewrite_source(
        source,
        text,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )


def try_normalize_symbolic_input(
    text: str,
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    formula_editor: bool,
    latex: str | None,
    allow_trig_functions: bool,
    allow_complex: bool,
    allow_sets: bool,
) -> SymbolicInputNormalizationResult:
    """Normalize a submission, returning existing user-facing parse failures."""
    try:
        return normalize_symbolic_input(
            text,
            variables,
            custom_functions,
            formula_editor=formula_editor,
            latex=latex,
            allow_trig_functions=allow_trig_functions,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
        )
    except SymbolicInputNormalizationError as exc:
        return psu.SympyParseFailure(exc.message)
    except psu.BaseSympyError as exc:

        def raise_normalization_error(
            error: psu.BaseSympyError = exc,
        ) -> sympy.Expr:
            raise error

        result = psu._try_parse_as_sympy(
            text,
            raise_normalization_error,
            allow_complex=allow_complex,
            imaginary_unit=None,
        )
        assert isinstance(result, psu.SympyParseFailure)
        return result


def _try_parse_normalized_source_as_sympy(
    source: SourceText,
    raw_text: str,
    variables: Iterable[str] | None,
    *,
    allow_complex: bool = False,
    allow_hidden: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: list[str] | None = None,
    imaginary_unit: str | None = None,
    simplify_expression: bool = True,
    assumptions: psu.AssumptionsDictT | None = None,
) -> psu.SympyParseResult:
    """Parse text that has already passed through symbolic-input normalization."""
    return psu._try_parse_as_sympy(
        raw_text,
        lambda: psu._convert_source_to_sympy_with_source(
            source,
            raw_text,
            variables,
            allow_hidden=allow_hidden,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig_functions,
            custom_functions=custom_functions,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
        )[0],
        allow_complex=allow_complex,
        imaginary_unit=imaginary_unit,
    )


def try_parse_symbolic_submission(
    submission: str | None,
    variables: Iterable[str] | None,
    *,
    formula_editor: bool = False,
    latex: str | None = None,
    allow_blank: bool = False,
    blank_value: str = "0",
    allow_complex: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: Sequence[str] = (),
    imaginary_unit: str | None = None,
    simplify_expression: bool = True,
    assumptions: psu.AssumptionsDictT | None = None,
) -> SymbolicSubmissionParseResult:
    """Normalize, parse, and serialize a symbolic-input submission."""
    if submission is None:
        return psu.SympyParseFailure("No submitted answer.")

    variable_list = list(variables or ())
    custom_function_list = list(custom_functions)
    normalized = try_normalize_symbolic_input(
        submission,
        variable_list,
        custom_function_list,
        formula_editor=formula_editor,
        latex=latex,
        allow_trig_functions=allow_trig_functions,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )
    if isinstance(normalized, psu.SympyParseFailure):
        return normalized

    if not normalized.text.strip():
        if not allow_blank:
            return psu.SympyParseFailure("No submitted answer.")
        if not blank_value.strip():
            return SymbolicSubmissionParseSuccess("", "")
        result = psu.try_parse_string_as_sympy(
            blank_value,
            variable_list,
            allow_hidden=True,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig_functions,
            imaginary_unit=imaginary_unit,
            custom_functions=custom_function_list,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
        )
    else:
        result = _try_parse_normalized_source_as_sympy(
            normalized,
            submission,
            variable_list,
            allow_hidden=True,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig_functions,
            imaginary_unit=imaginary_unit,
            custom_functions=custom_function_list,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
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
