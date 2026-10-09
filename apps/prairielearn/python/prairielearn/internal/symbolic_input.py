"""Internal parsing helpers shared by symbolic-input elements."""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache

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


_PLUS_MINUS_LATEX_PATTERN = re.compile(r"\\pm(?![a-zA-Z])|\+[{}]*-")


def _restore_plus_minus(submission: str, latex: str) -> str | None:
    r"""
    Turn the "+-" that the formula editor writes for `\pm` back into "±".

    The editor's plain text uses "+-" for both `\pm` and a typed "+" followed by
    "-". Both appear in the same order in the submitted LaTeX, so the k-th "+-" in
    the plain text comes from the k-th `\pm` or "+-" in the LaTeX.

    Returns:
        The submission with "±" restored, or None if the two can't be matched up
    """
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

    # The formula editor writes \lvert, \rvert and \mid as U+2223 (DIVIDES).
    sub = sub.replace("∣", "|")  # ruff:ignore[ambiguous-unicode-character-string]

    pattern = re.compile(
        r"(\|\s*[a-zA-Z0-9(+\-]([^|]*[a-zA-Z0-9!)])\s*\|)|(\|\s*[a-zA-Z0-9]\s*\|)"
    )
    bar_pattern = re.compile(r"\|")
    search_from = 0
    preceding_bars: list[int] = []
    while match := pattern.search(sub, search_from):
        # Find matches of |...| where:
        # when ignoring spaces, it either:
        # - starts with letter/number/opening paren/plus/minus and ends with letter/number/closing/exclamation mark paren
        # - is a single leter/number
        # Retain passed bars so nested matches can resume from the nearest one
        # without repeatedly scanning the processed prefix.
        preceding_bars.extend(
            bar_match.start()
            for bar_match in bar_pattern.finditer(sub, search_from, match.start())
        )

        content = match.group(0)[1:-1]  # Strip the bars
        # When set notation is allowed, a comma inside the match means the
        # pipes are a union operator pair around an interval or finite set
        # (e.g. the middle pipes in ``[0,1] | (2,3) | [4,5]``), not an
        # absolute value.
        # TODO: This can skip min/max operators or other functions that contain commas.
        if allow_sets and "," in content:
            preceding_bars.append(match.start())
            search_from = match.start() + 1
            continue

        sub = sub[: match.start()] + f"abs({content})" + sub[match.end() :]
        search_from = preceding_bars.pop() if preceding_bars else match.start()

    if not allow_sets and "|" in sub:
        return (
            None,
            f"The absolute value bars in your answer are mismatched or ambiguous: <code>{original_sub}</code>.",
        )

    return sub, None


def format_formula_editor_submission_for_sympy(
    sub: str | None,
    allow_trig: bool,  # ruff:ignore[boolean-type-hint-positional-argument]
    variables: list[str],
    custom_functions: list[str],
    *,
    allow_sets: bool = False,
    latex: str | None = None,
) -> str | None:
    r"""
    Format raw formula editor input to be compatible with SymPy.

    The formula editor outputs text with several quirks that need correction:
    1. The formula editor serializes ``\pm`` as "+-", which is restored when raw
       LaTeX is provided
    2. Invisible "{:" and ":}" operators from LaTeX copy-paste
    3. Multi-character names are space-separated: "s i n" instead of "sin"
    4. Numbers after variables need spacing: "x2" should be "x 2" for multiplication

    Args:
        sub: Raw text from the formula editor
        allow_trig: Whether trig functions (sin, cos, etc.) are available
        variables: List of allowed variable names
        custom_functions: List of custom function names
        allow_sets: Whether set operators and constructors are available
        latex: Raw LaTeX from the formula editor

    Returns:
        Formatted text ready for SymPy parsing, or None if input is None or the
        text and LaTeX representations can't be matched
    """
    if sub is None:
        return None

    text = sub if latex is None else _restore_plus_minus(sub, latex)
    if text is None:
        return None

    # Remove invisible LaTeX formatting operators
    text = text.replace("{:", "").replace(":}", "")

    # The editor writes \div as "-:" and \ast as " ** ". Powers are always written
    # with "^", so " ** " can only be a multiplication.
    text = text.replace("-:", "/").replace(" ** ", " * ")

    # Build list of all multi-character tokens that should be recognized as units
    known_tokens = _build_known_tokens(
        allow_trig, variables, custom_functions, allow_sets=allow_sets
    )

    # Replace Greek unicode letters with spaced ASCII for consistent handling further on
    text = "".join(_greek_transform(char) for char in text)

    # Merge space-separated characters into proper tokens (e.g., "s i n" -> "sin")
    text = _merge_spaced_tokens(text, known_tokens)

    # Add spaces between letters and numbers for implicit multiplication,
    # but preserve tokens like "f2" that are custom function names
    text = _add_multiplication_spaces(text, known_tokens)

    function_names = frozenset(
        psu.greek_unicode_transform(name)
        for name in (
            psu.get_builtin_callable_functions(
                allow_trig_functions=allow_trig,
                allow_sets=allow_sets,
            )
            | set(custom_functions)
        )
    )
    text = _wrap_bare_function_arguments(text, function_names)

    return text


def _build_known_tokens(
    allow_trig: bool,  # ruff:ignore[boolean-type-hint-positional-argument]
    variables: list[str],
    custom_functions: list[str],
    *,
    allow_sets: bool = False,
) -> list[str]:
    """
    Build a list of all multi-character tokens that should be recognized as single units.

    Returns:
        List of all multi-character tokens that should be recognized as single units.
    """
    # Include 1-letter tokens here since Greek letters might become multi-letter tokens when transformed
    tokens = (
        list(psu.STANDARD_OPERATORS)
        + list(
            psu.get_builtin_functions(
                allow_trig_functions=allow_trig,
                allow_sets=allow_sets,
            )
        )
        + custom_functions
        + variables
    )

    # Add transformed versions of Greek letters
    tokens += [
        psu.greek_unicode_transform(token)
        for token in tokens
        if psu.greek_unicode_transform(token) != token
    ]

    # Filter out single-letter tokens. The editor writes powers with "^", so merging
    # "* *" into "**" would only turn adjacent multiplication signs into a Python power.
    tokens = [token for token in tokens if len(token) > 1 and token != "**"]

    return tokens


def _greek_transform(text: str) -> str:
    """
    Replace Greek unicode letters with their English spelling and insert spaces around,
    every letter so that they are handled equivalently to letters already spelled in English.

    Example: "Α0x" becomes " A l p h a 0 x ", the same as if it was spelled out in the
    submission (and the consecutive processing steps will correct the spacing)

    Returns:
        The string with Greek unicode letters replaced by spaced-out English spelling
    """  # ruff:ignore[ambiguous-unicode-character-docstring]
    transformed = psu.greek_unicode_transform(text)
    return (" " + " ".join(transformed) + " ") if transformed != text else text


def _merge_spaced_tokens(text: str, tokens: list[str]) -> str:
    """
    Replace space-separated versions of tokens with their unspaced form.

    Example: "s i n ( x )" becomes "sin ( x )"

    Returns:
        The text with spaced tokens merged
    """
    result = []
    i = 0
    n = len(text)

    # Precompute spaced forms and lengths
    spaced = [(token, " ".join(token), len(" ".join(token))) for token in tokens]

    # Sort by spaced_token length so longer tokens match first
    # e.g. "acosh" must be checked before "acos" to avoid partial matches.
    spaced.sort(key=lambda x: -x[2])

    while i < n:
        matched = False

        # Try each spaced token
        for token, spaced_token, length in spaced:
            if text.startswith(spaced_token, i):
                result.append(token)
                i += length
                matched = True
                break

        if not matched:
            result.append(text[i])
            i += 1

    return "".join(result)


def _add_multiplication_spaces(text: str, protected_tokens: list[str]) -> str:
    """
    Insert spaces between letter-digit pairs to indicate multiplication.

    Example: "x2" becomes "x 2"

    However, we preserve tokens that naturally contain digits (like "f2" for
    a custom function) by marking their character positions as protected.

    Returns:
        The text with multiplication spaces added
    """
    # Find all positions that are part of tokens containing digits
    protected_positions = set()
    for token in protected_tokens:
        if not re.search(r"\d", token):
            continue
        for match in re.finditer(re.escape(token), text):
            protected_positions.update(range(match.start(), match.end()))

    # Build result, inserting spaces where appropriate
    result = []
    for i, char in enumerate(text):
        result.append(char)

        # Check if we need a space after this character
        has_next = i + 1 < len(text)
        if not has_next:
            continue

        next_char = text[i + 1]
        next_position = i + 1

        # Insert space if: letter followed by digit, and next position is not protected
        if (
            char.isalpha()
            and next_char.isdigit()
            and next_position not in protected_positions
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
    """
    Match bare function starts and tokens that affect their argument boundaries.

    Returns:
        The compiled pattern, cached per set of function names
    """
    names = sorted(function_names, key=len, reverse=True)
    return re.compile(
        r"(?P<function>(?<![A-Za-z_])(?:"
        + "|".join(map(re.escape, names))
        + r")\s+(?=[^\s(]))|(?P<token>\*+|[()\[\]{}+\-/,])"
    )


def _wrap_bare_function_arguments(text: str, function_names: frozenset[str]) -> str:
    r"""
    Parenthesize unparenthesized function arguments that are followed by "*" or "(".

    The formula editor displays `{\ln 4}\cdot x` as ln(4)·x but submits it as
    "ln 4 * x". SymPy's implicit function application ends the argument at "+",
    "-", or "/", but not at "*", so it would parse this as ln(4x). It also can't
    end the argument at a "(" that multiplies it, so "ln 8(x+1)" is a syntax error.

    Example: "ln 4 * cot (9x)" becomes "ln (4) * cot (9x)", and "ln 8(x+1)"
    becomes "ln (8)(x+1)"

    Returns:
        The text with those arguments wrapped in parentheses
    """
    if not function_names:
        return text
    pattern = _bare_function_token_pattern(function_names)

    # Each "(" sorts before a ")" at the same index, which only happens for an
    # empty argument.
    insertions: list[tuple[int, str]] = []
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

    result = []
    pos = 0
    for index, paren in sorted(insertions):
        result.extend((text[pos:index], paren))
        pos = index
    result.append(text[pos:])
    return "".join(result)
