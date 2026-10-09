"""Internal parsing helpers shared by symbolic-input elements."""

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from functools import lru_cache

import sympy

import prairielearn.sympy_utils as psu


@dataclass(frozen=True, slots=True)
class SourceToken:
    """One transformed character and its position in the raw source."""

    text: str
    raw_offset: int

    def __post_init__(self) -> None:
        """Validate that this token represents one transformed character."""
        if len(self.text) != 1:
            raise ValueError("SourceToken must contain exactly one character")

    def rewrite(self, text: str) -> tuple["SourceToken", ...]:
        return tuple(SourceToken(char, self.raw_offset) for char in text)


@dataclass(frozen=True, slots=True)
class SourceText:
    """Transformed tokens that retain positions in the immutable raw source."""

    raw_text: str
    tokens: tuple[SourceToken, ...]

    def __post_init__(self) -> None:
        """Validate that token provenance refers to the raw source in order."""
        if any(
            token.raw_offset < 0 or token.raw_offset >= len(self.raw_text)
            for token in self.tokens
        ):
            raise ValueError("SourceText offsets must refer to the raw source")
        if any(
            left.raw_offset > right.raw_offset
            for left, right in zip(self.tokens, self.tokens[1:], strict=False)
        ):
            raise ValueError("SourceText offsets must be nondecreasing")

    @property
    def text(self) -> str:
        return "".join(token.text for token in self.tokens)

    @classmethod
    def from_text(cls, text: str) -> "SourceText":
        return cls(
            text, tuple(SourceToken(char, offset) for offset, char in enumerate(text))
        )

    def replace(self, tokens: Iterable[SourceToken]) -> "SourceText":
        return SourceText(self.raw_text, tuple(tokens))


@dataclass(frozen=True, slots=True)
class SymbolicInputNormalizationError(Exception):
    message: str


type SymbolicInputNormalizationResult = SourceText | psu.SympyParseFailure


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

    tokens: list[SourceToken] = []
    last_end = 0
    for match, is_plus_minus in zip(matches, from_plus_minus, strict=True):
        tokens.extend(source.tokens[last_end : match.start()])
        if is_plus_minus:
            tokens.extend(source.tokens[match.start()].rewrite("±"))
        else:
            tokens.extend(source.tokens[match.start() : match.end()])
        last_end = match.end()
    tokens.extend(source.tokens[last_end:])
    return source.replace(tokens)


def _delete_literal(source: SourceText, literal: str) -> SourceText:
    tokens: list[SourceToken] = []
    last_end = 0
    for match in re.finditer(re.escape(literal), source.text):
        tokens.extend(source.tokens[last_end : match.start()])
        last_end = match.end()
    tokens.extend(source.tokens[last_end:])
    return source.replace(tokens)


def _replace_editor_operators(source: SourceText) -> SourceText:
    text = source.text
    tokens: list[SourceToken] = []
    index = 0
    while index < len(text):
        if text.startswith("-:", index):
            tokens.extend(source.tokens[index].rewrite("/"))
            index += 2
            continue
        if text.startswith(" ** ", index):
            left_star = source.tokens[index + 1]
            right_star = source.tokens[index + 2]
            if (
                source.raw_text[left_star.raw_offset] == "*"
                and source.raw_text[right_star.raw_offset] == "*"
            ):
                tokens.extend((
                    source.tokens[index],
                    left_star,
                    source.tokens[index + 3],
                ))
                index += 4
                continue
        tokens.append(source.tokens[index])
        index += 1
    return source.replace(tokens)


def _build_formula_editor_tokens(
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    allow_trig_functions: bool,
    allow_sets: bool,
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


def _merge_spaced_source(source: SourceText, tokens: Sequence[str]) -> SourceText:
    spaced = [(token, " ".join(token)) for token in tokens]
    spaced.sort(key=lambda item: -len(item[1]))

    merged_tokens: list[SourceToken] = []
    text = source.text
    index = 0
    while index < len(text):
        for token, spaced_token in spaced:
            if text.startswith(spaced_token, index):
                for char_index, char in enumerate(token):
                    merged_tokens.extend(
                        source.tokens[index + char_index * 2].rewrite(char)
                    )
                index += len(spaced_token)
                break
        else:
            merged_tokens.append(source.tokens[index])
            index += 1
    return source.replace(merged_tokens)


def _add_multiplication_spaces_source(
    source: SourceText, protected_tokens: Sequence[str]
) -> SourceText:
    text = source.text
    protected_positions: set[int] = set()
    for token in protected_tokens:
        if not re.search(r"\d", token):
            continue
        for match in re.finditer(re.escape(token), text):
            protected_positions.update(range(match.start(), match.end()))

    tokens: list[SourceToken] = []
    for index, token in enumerate(source.tokens):
        tokens.append(token)
        if index + 1 >= len(source.tokens):
            continue
        if (
            token.text.isalpha()
            and source.tokens[index + 1].text.isdigit()
            and index + 1 not in protected_positions
        ):
            tokens.extend(source.tokens[index + 1].rewrite(" "))
    return source.replace(tokens)


_TRAILING_IDENTIFIER_PATTERN = re.compile(r"[A-Za-z_]\w*$")


def _is_implicit_multiplication_paren(
    text: str,
    argument_start: int,
    argument_end: int,
    function_names: frozenset[str],
) -> bool:
    """
    Whether a "(" after an argument multiplies it rather than calling a function
    or grouping an exponent.

    Returns:
        True if the argument ends with a number, a closing bracket, or a name
        that isn't a function.
    """
    # An empty candidate provides no left-hand factor for implicit multiplication.
    if argument_end == argument_start:
        return False

    # Isolate the final identifier before checking its last character. This keeps
    # digit-suffixed function names such as atan2 from looking like numbers.
    name_start = argument_end
    while name_start > argument_start and (
        text[name_start - 1].isalnum() or text[name_start - 1] == "_"
    ):
        name_start -= 1
    name = _TRAILING_IDENTIFIER_PATTERN.search(text, name_start, argument_end)

    # Known functions consume the "(" as a call; all other names multiply the
    # parenthesized factor.
    if name is not None:
        return name.group(0) not in function_names

    # Known digit-suffixed functions were handled above, so a remaining digit
    # ends a numeric argument before the next implicitly multiplied factor.
    if text[argument_end - 1].isdigit():
        return True

    # A closing delimiter completes a grouped argument, making the following
    # "(" the start of a new implicitly multiplied factor.
    return text[argument_end - 1] in ")]}"


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
    text = source.text
    pattern = _bare_function_token_pattern(function_names)
    # Each "(" sorts before a ")" at the same index, which only happens for an
    # empty argument.
    insertions: list[tuple[int, SourceToken]] = []
    # Only the first bare function at a given nesting depth can claim the next
    # implicit multiplication boundary; any later one is inside its argument.
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
                    argument_start = start
                    while (
                        argument_start < match.start()
                        and text[argument_start].isspace()
                    ):
                        argument_start += 1
                    argument_end = match.start()
                    while (
                        argument_end > argument_start
                        and text[argument_end - 1].isspace()
                    ):
                        argument_end -= 1
                    if token == "*" or _is_implicit_multiplication_paren(
                        text, argument_start, argument_end, function_names
                    ):
                        pending_arguments.pop(depth)
                        open_token = source.tokens[
                            min(argument_start, len(source.tokens) - 1)
                        ].rewrite("(")[0]
                        close_token = source.tokens[max(argument_end - 1, 0)].rewrite(
                            ")"
                        )[0]
                        insertions.extend((
                            (start, open_token),
                            (argument_end, close_token),
                        ))
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

    tokens: list[SourceToken] = []
    position = 0
    for index, parenthesis in sorted(
        insertions, key=lambda insertion: (insertion[0], insertion[1].text)
    ):
        tokens.extend(source.tokens[position:index])
        tokens.append(parenthesis)
        position = index
    tokens.extend(source.tokens[position:])
    return source.replace(tokens)


def _format_formula_editor_source(
    source: SourceText,
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    allow_trig_functions: bool,
    allow_sets: bool,
) -> SourceText:
    source = _delete_literal(_delete_literal(source, "{:"), ":}")
    source = _replace_editor_operators(source)
    known_tokens = _build_formula_editor_tokens(
        variables,
        custom_functions,
        allow_trig_functions=allow_trig_functions,
        allow_sets=allow_sets,
    )
    source = _merge_spaced_source(source, known_tokens)
    source = _add_multiplication_spaces_source(source, known_tokens)
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
    return _wrap_bare_function_arguments_source(source, function_names)


_ABSOLUTE_VALUE_PATTERN = re.compile(
    r"(\|\s*[a-zA-Z0-9(+\-]([^|]*[a-zA-Z0-9!)])\s*\|)|(\|\s*[a-zA-Z0-9]\s*\|)"
)


def _convert_absolute_values_source(
    source: SourceText, *, allow_sets: bool
) -> SourceText:
    original_text = source.text
    text = original_text
    tokens = list(source.tokens)
    bar_pattern = re.compile(r"\|")
    search_from = 0
    preceding_bars: list[int] = []
    while match := _ABSOLUTE_VALUE_PATTERN.search(text, search_from):
        preceding_bars.extend(
            bar_match.start()
            for bar_match in bar_pattern.finditer(text, search_from, match.start())
        )
        content = text[match.start() + 1 : match.end() - 1]
        if allow_sets and "," in content:
            preceding_bars.append(match.start())
            search_from = match.start() + 1
            continue

        replacement_tokens = (
            tokens[match.start()].rewrite("abs(")
            + tuple(tokens[match.start() + 1 : match.end() - 1])
            + tokens[match.end() - 1].rewrite(")")
        )
        text = text[: match.start()] + f"abs({content})" + text[match.end() :]
        tokens[match.start() : match.end()] = replacement_tokens
        search_from = preceding_bars.pop() if preceding_bars else match.start()

    if not allow_sets and "|" in text:
        raise SymbolicInputNormalizationError(
            f"The absolute value bars in your answer are mismatched or ambiguous: <code>{original_text}</code>."
        )
    return source.replace(tokens)


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
            variables,
            custom_functions,
            allow_trig_functions=allow_trig_functions,
            allow_sets=allow_sets,
        )
    source = _convert_absolute_values_source(source, allow_sets=allow_sets)
    return psu._validate_and_rewrite_source(
        source,
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


def try_parse_normalized_source_as_sympy(
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
