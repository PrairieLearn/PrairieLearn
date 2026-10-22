"""Internal normalization helpers for symbolic element submissions."""

import re
from collections.abc import Callable, Sequence
from functools import lru_cache

_ABSOLUTE_VALUE_PATTERN = re.compile(
    r"(\|\s*[a-zA-Z0-9(+\-]([^|]*[a-zA-Z0-9!)])\s*\|)|(\|\s*[a-zA-Z0-9]\s*\|)"
)
_BAR_PATTERN = re.compile(r"\|")


def normalize_absolute_value_bars(submission: str, *, allow_sets: bool) -> str | None:
    """Replace absolute-value bars with syntax understood by the SymPy parser."""
    # The formula editor writes \lvert, \rvert and \mid as U+2223 (DIVIDES).
    submission = submission.replace("\u2223", "|")

    search_from = 0
    preceding_bars: list[int] = []
    while match := _ABSOLUTE_VALUE_PATTERN.search(submission, search_from):
        preceding_bars.extend(
            bar_match.start()
            for bar_match in _BAR_PATTERN.finditer(
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
        return None

    return submission


_PLUS_MINUS_LATEX_PATTERN = re.compile(r"\\pm(?![a-zA-Z])|\+[{}]*-")


def _restore_formula_editor_plus_minus(submission: str, latex: str) -> str | None:
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


def _format_formula_editor_greek_character(
    character: str, unicode_transform: Callable[[str], str]
) -> str:
    transformed = unicode_transform(character)
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


def _is_implicit_multiplication_parenthesis(
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
                    if token == "*" or _is_implicit_multiplication_parenthesis(
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


def normalize_formula_editor_submission(
    submission: str,
    known_tokens: Sequence[str],
    function_names: frozenset[str],
    *,
    latex: str | None,
    unicode_transform: Callable[[str], str],
) -> str | None:
    """Normalize formula-editor transport output before symbolic parsing."""
    text = (
        submission
        if latex is None
        else _restore_formula_editor_plus_minus(submission, latex)
    )
    if text is None:
        return None

    text = text.replace("{:", "").replace(":}", "")
    text = text.replace("-:", "/").replace(" ** ", " * ")
    text = "".join(
        _format_formula_editor_greek_character(character, unicode_transform)
        for character in text
    )
    text = _merge_formula_editor_tokens(text, known_tokens)
    text = _add_formula_editor_multiplication_spaces(text, known_tokens)
    return _wrap_bare_function_arguments(text, function_names)
