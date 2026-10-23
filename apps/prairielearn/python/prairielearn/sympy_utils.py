"""Utility functions for parsing and evaluating SymPy expressions.

```python
from prairielearn.sympy_utils import ...
```
"""

import html
import re
import string
import unicodedata
from collections import deque
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from enum import Enum
from functools import lru_cache
from io import StringIO
from tokenize import NUMBER, TokenError, generate_tokens
from typing import (
    Any,
    Literal,
    Never,
    NotRequired,
    TypedDict,
    TypeGuard,
    assert_never,
    cast,
    overload,
)

import sympy
from sympy.logic.boolalg import Boolean
from sympy.printing.str import StrPrinter

from prairielearn.internal import (
    sympy_constants,
    sympy_evaluation,
    sympy_expression,
    sympy_source,
)
from prairielearn.misc_utils import full_unidecode

STANDARD_OPERATORS = sympy_constants.standard_operators
SET_NOTATION_OPERATORS = sympy_constants.set_notation_operators
# Compatibility alias for code that previously accessed the container class.
_Constants = sympy_constants
SYMPY_PARSE_ERROR_WITHOUT_LOCATION = (
    "Your answer has a syntax error. "
    "This issue might be caused by mismatched parentheses or some other misplaced symbol."
)
SYMPY_EVALUATION_ERROR_WITHOUT_LOCATION = (
    "Your answer contains an invalid expression that could not be evaluated. "
    "Check that each function and operator is used with valid arguments."
)

SympyMapT = dict[str, sympy.Basic | complex]
SympyFunctionMapT = dict[str, Callable[..., Any]]
AssumptionsDictT = dict[str, dict[str, Any]]
"""
A dictionary of assumptions for variables in the expression.

Examples:
    >>> {"x": {"positive": True}, "y": {"real": True}}
"""


class SympyJson(TypedDict):
    """A class with type signatures for the SymPy JSON dict"""

    _type: Literal["sympy"]
    _value: str
    _variables: list[str]
    _assumptions: NotRequired[AssumptionsDictT]
    _custom_functions: NotRequired[list[str]]


type SympyExpression = sympy.Expr | Boolean
type SympyValue = SympyExpression | sympy.Set


@dataclass(frozen=True, slots=True)
class SympyParseSuccess[T: SympyValue = SympyValue]:
    expr: T


@dataclass(frozen=True, slots=True)
class SympyParseFailure:
    error: str


type SympyParseResult[T: SympyValue = SympyValue] = (
    SympyParseSuccess[T] | SympyParseFailure
)
type _SympyValueType = Literal["expression", "set", "finite-set", "interval"]
type _UsedSympyType = _SympyValueType | Literal["empty-set"]
type AllowedSympyType = Literal["all"] | _SympyValueType


def _used_sympy_types(expr: sympy.Basic) -> set[_UsedSympyType]:
    if expr is sympy.EmptySet:
        return {"empty-set"}
    # Reals compares equal to Interval(-oo, oo), but only the domain object is a named set.
    if any(expr is domain for domain in sympy_constants.set_domains):
        return {"set"}
    if isinstance(expr, sympy.Interval):
        return {"interval"}
    if isinstance(expr, sympy.Set) and expr.is_finite_set:
        required_types: set[_UsedSympyType] = {"finite-set"}
        for arg in expr.args:
            if isinstance(arg, sympy.Set):
                required_types.update(_used_sympy_types(arg))
        return required_types
    if isinstance(expr, (sympy.Union, sympy.Intersection, sympy.Complement)):
        required_types: set[_UsedSympyType] = set()
        for arg in expr.args:
            arg_types = _used_sympy_types(arg)
            required_types.update(arg_types)
        return required_types
    if isinstance(expr, sympy.Set):
        return {"set"}
    return {"expression"}


def check_sympy_types(
    expr: sympy.Basic, allowed_types: set[AllowedSympyType]
) -> SympyParseFailure | None:
    """Return a parse failure if the expression uses a disallowed SymPy type."""
    used_types = _used_sympy_types(expr)
    matches_allowed_type = (
        "all" in allowed_types
        or (isinstance(expr, sympy.Set) and "set" in allowed_types)
        or all(
            not {"set", "finite-set", "interval"}.isdisjoint(allowed_types)
            if used_type == "empty-set"
            else used_type in allowed_types
            for used_type in used_types
        )
    )
    if matches_allowed_type:
        return None

    disallowed_types = {
        "set" if used_type == "empty-set" else used_type
        for used_type in used_types
        if (
            {"set", "finite-set", "interval"}.isdisjoint(allowed_types)
            if used_type == "empty-set"
            else used_type not in allowed_types
        )
    }
    return SympyParseFailure(
        f"Your answer uses {', '.join(sorted(disallowed_types))}, which this input "
        f"does not accept. Allowed types: {', '.join(sorted(allowed_types))}."
    )


def is_sympy_json(json: Any) -> TypeGuard[SympyJson]:
    """Check if the input is a valid SymPy JSON dict.

    Returns:
        `True` if the input is a valid SymPy JSON dict, `False` otherwise.
    """
    return (
        isinstance(json, dict)
        and json.get("_type") == "sympy"
        and isinstance(json.get("_value"), str)
        and isinstance(json.get("_variables"), list)
        and isinstance(json.get("_assumptions", {}), dict)
        and isinstance(json.get("_custom_functions", []), list)
    )


class LocalsForEval(TypedDict):
    """A class with type signatures for the locals_for_eval dict"""

    functions: SympyFunctionMapT
    variables: SympyMapT
    helpers: SympyFunctionMapT


class _SympyJsonStrPrinter(StrPrinter):
    """String printer that keeps set notation parseable by the symbolic grammar.

    Callers must deserialize with `allow_sets=True` or the literal forms will be rejected.
    """

    def _print_EmptySet(self, expr: sympy.Set) -> Any:  # ruff: ignore[unused-method-argument, invalid-function-name]
        return r"{}"

    def _print_Interval(self, i: sympy.Interval) -> str:  # ruff: ignore[invalid-function-name]
        start, end = self.doprint(i.start), self.doprint(i.end)
        left = "(" if i.left_open else "["
        right = ")" if i.right_open else "]"
        return f"{left}{start}, {end}{right}"

    def _print_Union(self, expr: sympy.Union) -> str:  # ruff: ignore[invalid-function-name]
        return f"Union({', '.join(map(self.doprint, expr.args))})"

    def _print_Intersection(self, expr: sympy.Intersection) -> str:  # ruff: ignore[invalid-function-name]
        return f"Intersection({', '.join(map(self.doprint, expr.args))})"

    def _print_Complement(self, expr: sympy.Complement) -> str:  # ruff: ignore[invalid-function-name]
        return f"Complement({', '.join(map(self.doprint, expr.args))})"


class BaseSympyError(Exception):
    """Exception base class for SymPy parsing errors"""


class HasConflictingVariableError(BaseSympyError):
    pass


class HasConflictingFunctionError(BaseSympyError):
    pass


class HasInvalidAssumptionError(BaseSympyError):
    pass


@dataclass
class HasFloatError(BaseSympyError):
    n: float


class HasComplexError(BaseSympyError):
    pass


@dataclass
class HasSetNotationError(BaseSympyError):
    pass


@dataclass
class HasInvalidExpressionError(BaseSympyError):
    offset: int


@dataclass
class HasInvalidFunctionError(BaseSympyError):
    offset: int
    text: str


@dataclass
class FunctionNameWithoutArgumentsError(BaseSympyError):
    offset: int
    text: str


@dataclass
class HasParseError(BaseSympyError):
    offset: int


@dataclass
class HasEscapeError(BaseSympyError):
    offset: int


@dataclass
class HasCommentError(BaseSympyError):
    offset: int


@dataclass
class HasInvalidSymbolError(BaseSympyError):
    symbol: str
    offset: int | None = None


# Deprecated / unused, kept for backwards compatibility.
@dataclass
class HasInvalidVariableError(BaseSympyError):
    """Deprecated / unused."""

    offset: int
    text: str


class _SympyType(Enum):
    SCALAR = "number"
    SET = "set"
    BOOL = "true/false"
    STRING = "text"

    def __str__(self) -> str:
        """Returns `self.value`"""
        return self.value


def _allows_legacy_custom_function_override(name: str) -> bool:
    return name in sympy_constants.legacy_custom_function_overrides


@dataclass
class HasArgumentTypeError(BaseSympyError):
    fn: str
    got: _SympyType
    allowable_types: Sequence[_SympyType]
    arg_idx: int
    offset: int = -1

    def format_allowable_types(self) -> str:
        if len(self.allowable_types) == 1:
            return f"a {self.allowable_types[0]}"
        return f"either {_format_comma_separated(list(dict.fromkeys(self.allowable_types)))}"


@dataclass
class HasFunctionArityError(BaseSympyError):
    fn: str
    provided: int
    expected: str
    offset: int = -1


@dataclass(frozen=True, slots=True)
class _IndexEvidence:
    index: int


@dataclass(frozen=True, slots=True)
class _TokenEvidence:
    token: str


type _ErrorEvidence = sympy_source.SourceSpan | _IndexEvidence | _TokenEvidence | None


@dataclass(frozen=True, slots=True)
class _LocalizedSympyError(Exception):
    error: BaseSympyError
    source: sympy_source.SourceText
    evidence: _ErrorEvidence = None
    evaluation_failure: bool = False
    cause: BaseException | None = None


def sympy_check(
    expr: SympyValue,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool,
    allow_sets: bool,
    allow_extra_symbols: bool = False,
    # True would ensure semantic checks by default but break compatibility.
    check_evaluated_complex: bool = False,
) -> None:
    """Check the SymPy expression for complex numbers, invalid symbols, and floats."""
    valid_symbols = set().union(
        *(cast(SympyMapT, inner_dict).keys() for inner_dict in locals_for_eval.values())
    )

    def check_nodes(
        root: sympy.Basic, *, check_structure: bool, check_complex: bool
    ) -> None:
        checked_nodes: set[sympy.Basic] | None = (
            set() if check_evaluated_complex else None
        )
        work_stack: deque[sympy.Basic] = deque([root])

        while work_stack:
            item = work_stack.pop()
            if checked_nodes is not None:
                if item in checked_nodes:
                    continue
                checked_nodes.add(item)

            if check_structure:
                # Avoid str(item) on every node: printing each subtree is quadratic in
                # the size of the expression and dominates parse time.
                if (
                    not allow_extra_symbols
                    and isinstance(item, sympy.Symbol)
                    and (str_item := str(item)) not in valid_symbols
                ):
                    raise HasInvalidSymbolError(str_item)
                if isinstance(item, sympy.Float):
                    raise HasFloatError(float(str(item)))
                if not allow_sets and isinstance(item, sympy.Set):
                    raise HasSetNotationError
            if check_complex and not allow_complex and _is_disallowed_complex(item):
                raise HasComplexError("complex values not allowed")

            work_stack.extend(item.args)

    # SymPy's assumptions can be inconsistent for unevaluated arithmetic trees.
    # When checking an evaluated copy, only use the original tree for structural
    # validation so that it remains available for display without determining
    # whether the expression is complex.
    check_nodes(
        expr,
        check_structure=True,
        check_complex=not check_evaluated_complex,
    )

    if check_evaluated_complex:
        # Reevaluate the existing tree without reparsing, while preserving the
        # unevaluated result returned for display.
        try:
            evaluated_expr = expr.doit(deep=True)
        except Exception as exc:
            raise BaseSympyError from exc
        check_nodes(evaluated_expr, check_structure=False, check_complex=True)


def _is_disallowed_complex(item: sympy.Basic) -> bool:
    """Return whether an expression is a finite complex value."""
    if item is sympy.I:
        return True

    # The is_finite guard excludes zoo (complex infinity from 1/0) and similar
    # non-finite values, which aren't complex in the student-input sense.
    # is_extended_real can trigger internal SymPy bugs on certain unevaluated
    # expressions (e.g. sec(0) with evaluateFalse).
    try:
        return (
            item.is_extended_real is False
            and getattr(item, "is_finite", None) is not False
        )
    except AttributeError:
        return False


@overload
def evaluate(
    expr: str,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool = False,
    allow_sets: Literal[False] = False,
) -> SympyExpression: ...


@overload
def evaluate(
    expr: str,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool = False,
    allow_sets: bool,
) -> SympyValue: ...


def evaluate(
    expr: str,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool = False,
    allow_sets: bool = False,
) -> SympyValue:
    """Evaluate a SymPy expression string with a given set of locals, and return only the result.

    Returns:
        A SymPy expression.
    """
    source = _normalize_source(
        expr,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )
    try:
        return _evaluate_normalized_source(
            source,
            locals_for_eval,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            simplify_expression=True,
            allow_extra_symbols=False,
        )
    except _LocalizedSympyError as exc:
        _raise_unwrapped(exc)


def _format_comma_separated(items: Iterable[Any], last_conjunction: str = "or") -> str:
    comma_sep = ", ".join(map(str, items))
    return f" {last_conjunction} ".join(comma_sep.rsplit(", ", maxsplit=1))


def _normalize_unicode_source(
    source: sympy_source.SourceText, *, formula_editor: bool = False
) -> sympy_source.SourceText:
    """Normalize Unicode while retaining the raw offset of every output character."""
    const = sympy_constants
    normalized_tokens: list[sympy_source.SourceToken] = []
    for token in source.tokens:
        char = token.text
        normalized_char = char
        if char in const.unicode_operators:
            normalized_char = const.unicode_operators[char]
        elif char in const.plus_minus_operators or (
            not char.isascii()
            and unicodedata.decomposition(char).startswith(("<super>", "<sub>"))
        ):
            # unidecode would turn "±" into "+-" and "x²" into "x2" (i.e. 2*x). The
            # formula editor writes exponents and subscripts with "^" and "_".
            raise HasInvalidSymbolError(char, token.raw_offset)
        # Single-char codepoints only; multi-char keys like "cup" are unidecoded
        # character-by-character (a no-op for ASCII).
        elif char not in const.set_operator_names:
            greek_normalized = greek_unicode_transform(char)
            normalized_char = full_unidecode(greek_normalized)
            # unidecode uses "[?]" for characters it doesn't know, which would
            # otherwise be misreported as set notation.
            if normalized_char == "[?]" and char != normalized_char:
                raise HasInvalidSymbolError(char, token.raw_offset)
            if formula_editor and greek_normalized != char:
                normalized_char = f" {' '.join(normalized_char)} "

        normalized_tokens.extend(token.rewrite(normalized_char))
    return source.replace(normalized_tokens)


# The lookahead allows overlapping pairs, so a Unicode sign after "**" is checked.
_MULTIPLICATION_PAIR_PATTERN = r"(?=(?P<left>\*)\s*(?P<right>\*))"


def _validate_multiplication(source: sympy_source.SourceText) -> None:
    """Reject multiplication signs that normalization would turn into exponentiation."""
    for match in re.finditer(_MULTIPLICATION_PAIR_PATTERN, source.text):
        left_offset = source.tokens[match.start("left")].raw_offset
        right_offset = source.tokens[match.start("right")].raw_offset
        if source.raw_text[right_offset] != "*":
            raise HasInvalidExpressionError(right_offset)
        if source.raw_text[left_offset] != "*":
            raise HasInvalidExpressionError(left_offset)
        if match.start("right") > match.end("left"):
            raise HasInvalidExpressionError(left_offset)


def _validate_adjacent_numbers(source: sympy_source.SourceText) -> None:
    """Reject numeric tokens that implicit multiplication would silently combine."""
    line_offsets = [0]
    for line in source.text.splitlines(keepends=True):
        line_offsets.append(line_offsets[-1] + len(line))

    previous_number_end: tuple[int, int] | None = None
    try:
        for token in generate_tokens(StringIO(source.text).readline):
            if token.type != NUMBER:
                previous_number_end = None
                continue

            if token.start == previous_number_end:
                row, column = token.start
                offset = line_offsets[row - 1] + column
                raise HasInvalidExpressionError(source.tokens[offset].raw_offset)

            previous_number_end = token.end
    except TokenError:
        # The normal parsing path will report incomplete token streams.
        return


def _rewrite_pattern_source(
    source: sympy_source.SourceText,
    pattern: re.Pattern[str],
    replacement: Callable[
        [re.Match[str], tuple[sympy_source.SourceToken, ...]],
        Iterable[sympy_source.SourceToken],
    ],
) -> sympy_source.SourceText:
    tokens: list[sympy_source.SourceToken] = []
    last_end = 0
    for match in pattern.finditer(source.text):
        tokens.extend(source.tokens[last_end : match.start()])
        tokens.extend(replacement(match, source.tokens[match.start() : match.end()]))
        last_end = match.end()
    tokens.extend(source.tokens[last_end:])
    return source.replace(tokens)


def _validate_and_rewrite_source(
    source: sympy_source.SourceText,
    *,
    allow_complex: bool,
    allow_sets: bool,
) -> sympy_source.SourceText:
    _validate_multiplication(source)

    for symbol in sympy_constants.plus_minus_operators:
        ind = source.text.find(symbol)
        if ind != -1:
            raise HasInvalidSymbolError(symbol, source.tokens[ind].raw_offset)

    ind = source.text.find("\\")
    if ind != -1:
        raise HasEscapeError(source.tokens[ind].raw_offset)
    ind = source.text.find("#")
    if ind != -1:
        raise HasCommentError(source.tokens[ind].raw_offset)
    if stars := re.search(r"\*{3,}", source.text):
        raise HasInvalidExpressionError(source.tokens[stars.start()].raw_offset)
    if comparison := re.search(r"(?:==|!=|<=|>=|<|>|(?<!\*)=(?!=))", source.text):
        raise HasInvalidExpressionError(source.tokens[comparison.start()].raw_offset)
    if not allow_sets and any(
        token in source.text
        for token in ("[", "]", "{", "}", "∪", "∩", "&", "|")  # ruff:ignore[ambiguous-unicode-character-string]
    ):
        raise HasSetNotationError

    source = _rewrite_pattern_source(
        source,
        re.compile(r"\^"),
        lambda _match, tokens: tokens[0].rewrite("**"),
    )
    source = _rewrite_pattern_source(
        source,
        re.compile(r"(\d)([eE])([+-])"),
        lambda match, tokens: (
            tokens[:1] + tokens[1].rewrite(f"*{match.group(2)}") + tokens[2:]
        ),
    )
    if not allow_complex:
        source = _rewrite_pattern_source(
            source,
            re.compile(r"(\d)([jJ])(?![a-zA-Z0-9])"),
            lambda match, tokens: tokens[:1] + tokens[1].rewrite(f"*{match.group(2)}"),
        )
    _validate_adjacent_numbers(source)
    return source


def _normalize_source(
    text: str, *, allow_complex: bool, allow_sets: bool
) -> sympy_source.SourceText:
    source = _normalize_unicode_source(sympy_source.SourceText.from_text(text))
    return _validate_and_rewrite_source(
        source,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )


def _default_error_evidence(error: BaseSympyError) -> _ErrorEvidence:
    if isinstance(error, (HasInvalidFunctionError, FunctionNameWithoutArgumentsError)):
        return _TokenEvidence(error.text)
    if isinstance(error, (HasArgumentTypeError, HasFunctionArityError)):
        return _TokenEvidence(error.fn)
    if isinstance(error, HasInvalidSymbolError):
        if error.offset is not None and error.offset >= 0:
            return _IndexEvidence(error.offset)
        return _TokenEvidence(error.symbol)
    if (
        isinstance(
            error,
            (
                HasInvalidExpressionError,
                HasParseError,
                HasEscapeError,
                HasCommentError,
                HasInvalidVariableError,
            ),
        )
        and error.offset >= 0
    ):
        return _IndexEvidence(error.offset)
    return None


def _raise_unwrapped(error: _LocalizedSympyError) -> Never:
    if error.cause is not None:
        raise error.error from error.cause
    raise error.error from None


def _translate_evaluation_error(
    error: sympy_evaluation.ExpressionEvaluationError,
) -> _LocalizedSympyError:
    diagnostic = error.diagnostic
    evaluation_failure = False
    if isinstance(diagnostic, sympy_evaluation.ParseDiagnostic):
        public_error: BaseSympyError = HasParseError(diagnostic.offset)
    elif isinstance(diagnostic, sympy_evaluation.InvalidExpressionDiagnostic):
        public_error = HasInvalidExpressionError(diagnostic.offset)
    elif isinstance(diagnostic, sympy_evaluation.InvalidFunctionDiagnostic):
        public_error = HasInvalidFunctionError(diagnostic.offset, diagnostic.text)
    elif isinstance(diagnostic, sympy_evaluation.FunctionWithoutArgumentsDiagnostic):
        public_error = FunctionNameWithoutArgumentsError(
            diagnostic.offset, diagnostic.text
        )
    elif isinstance(diagnostic, sympy_evaluation.InvalidSymbolDiagnostic):
        public_error = HasInvalidSymbolError(diagnostic.symbol, diagnostic.offset)
    elif isinstance(diagnostic, sympy_evaluation.SetNotationDiagnostic):
        public_error = HasSetNotationError()
    elif isinstance(diagnostic, sympy_evaluation.ArgumentTypeDiagnostic):
        offset = (
            diagnostic.offset
            if diagnostic.offset >= 0 or error.span is None
            else error.span.start
        )
        public_error = HasArgumentTypeError(
            diagnostic.function,
            _SympyType(diagnostic.got.value),
            tuple(_SympyType(value.value) for value in diagnostic.allowable_types),
            diagnostic.argument_index,
            offset,
        )
    elif isinstance(diagnostic, sympy_evaluation.FunctionArityDiagnostic):
        offset = (
            diagnostic.offset
            if diagnostic.offset >= 0 or error.span is None
            else error.span.start
        )
        public_error = HasFunctionArityError(
            diagnostic.function,
            diagnostic.provided,
            diagnostic.expected,
            offset,
        )
    elif isinstance(diagnostic, sympy_evaluation.EvaluationFailureDiagnostic):
        public_error = BaseSympyError()
        evaluation_failure = True
    else:
        assert_never(diagnostic)

    return _LocalizedSympyError(
        public_error,
        error.source,
        error.span or _default_error_evidence(public_error),
        evaluation_failure=evaluation_failure,
        cause=error.cause,
    )


def _evaluate_normalized_source(
    source: sympy_source.SourceText,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool,
    allow_sets: bool,
    simplify_expression: bool,
    allow_extra_symbols: bool,
    legacy_untyped_names: frozenset[str] = frozenset(),
    legacy_untyped_functions: frozenset[str] = frozenset(),
) -> SympyValue:
    context = sympy_evaluation.EvaluationContext.from_locals_for_eval(
        locals_for_eval,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        simplify_expression=simplify_expression,
        allow_extra_symbols=allow_extra_symbols,
        legacy_untyped_names=legacy_untyped_names,
        legacy_untyped_functions=legacy_untyped_functions,
    )
    try:
        result = sympy_expression.parse_and_evaluate(source, context)
    except sympy_evaluation.ExpressionEvaluationError as exc:
        raise _translate_evaluation_error(exc) from None
    _check_evaluated_result(result, source, context)
    return result


def _evaluate_normalized_source_with_structure(
    source: sympy_source.SourceText,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool,
    allow_sets: bool,
    simplify_expression: bool,
    allow_extra_symbols: bool,
) -> tuple[SympyValue, str]:
    context = sympy_evaluation.EvaluationContext.from_locals_for_eval(
        locals_for_eval,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        simplify_expression=simplify_expression,
        allow_extra_symbols=allow_extra_symbols,
    )
    try:
        result, structure = sympy_expression.parse_and_evaluate_with_structure(
            source, context
        )
    except sympy_evaluation.ExpressionEvaluationError as exc:
        raise _translate_evaluation_error(exc) from None
    _check_evaluated_result(result, source, context)
    return result, structure


def _check_evaluated_result(
    result: SympyValue,
    source: sympy_source.SourceText,
    context: sympy_evaluation.EvaluationContext,
) -> None:
    try:
        sympy_check(
            result,
            context.locals_for_eval,
            allow_complex=context.allow_complex,
            allow_sets=context.allow_sets,
            allow_extra_symbols=context.allow_extra_symbols,
            check_evaluated_complex=(
                not context.simplify_expression and not context.allow_complex
            ),
        )
    except BaseSympyError as exc:
        raise _LocalizedSympyError(
            exc,
            source,
            _default_error_evidence(exc),
            cause=exc.__cause__,
        ) from None


@overload
def evaluate_with_source(
    expr: str,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool = False,
    allow_sets: Literal[False] = False,
    simplify_expression: bool = True,
    allow_extra_symbols: bool = False,
) -> tuple[SympyExpression, str]: ...


@overload
def evaluate_with_source(
    expr: str,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool = False,
    allow_sets: bool,
    simplify_expression: bool = True,
    allow_extra_symbols: bool = False,
) -> tuple[SympyValue, str]: ...


def evaluate_with_source(
    expr: str,
    locals_for_eval: LocalsForEval,
    *,
    allow_complex: bool = False,
    allow_sets: bool = False,
    simplify_expression: bool = True,
    allow_extra_symbols: bool = False,
) -> tuple[SympyValue, str]:
    """Evaluate a SymPy expression string and return its lowered structure."""
    source = _normalize_source(
        expr,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )
    try:
        return _evaluate_normalized_source_with_structure(
            source,
            locals_for_eval,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            simplify_expression=simplify_expression,
            allow_extra_symbols=allow_extra_symbols,
        )
    except _LocalizedSympyError as exc:
        _raise_unwrapped(exc)


@overload
def convert_string_to_sympy(
    expr: str,
    variables: Iterable[str] | None = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_sets: Literal[False] = False,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
    custom_functions: Iterable[str] | None = None,
    assumptions: AssumptionsDictT | None = None,
    allow_extra_symbols: bool = False,
) -> SympyExpression: ...


@overload
def convert_string_to_sympy(
    expr: str,
    variables: Iterable[str] | None = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_sets: bool,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
    custom_functions: Iterable[str] | None = None,
    assumptions: AssumptionsDictT | None = None,
    allow_extra_symbols: bool = False,
) -> SympyValue: ...


def convert_string_to_sympy(
    expr: str,
    variables: Iterable[str] | None = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
    custom_functions: Iterable[str] | None = None,
    assumptions: AssumptionsDictT | None = None,
    allow_extra_symbols: bool = False,
) -> SympyValue:
    """
    Convert a string to a SymPy expression, with optional restrictions on
    the variables and functions that can be used. If the string is invalid,
    raise an exception with a message that can be displayed to the user.

    Parameters:
        expr: The string to convert to a SymPy expression.
        variables: A list of variable names that are allowed in the expression.
        allow_hidden: Whether to allow hidden variables (like pi and e).
        allow_complex: Whether to allow complex numbers (like i).
        allow_trig_functions: Whether to allow trigonometric functions.
        simplify_expression: Whether to simplify the expression during conversion by evaluating it.
        custom_functions: A list of custom function names that are allowed in the expression.
        assumptions: A dictionary of assumptions for variables in the expression.
        allow_extra_symbols: Whether to allow symbols not listed in `variables`. Useful for
            inferring the variables of an expression from its free symbols.

    Examples:
        >>> convert_string_to_sympy("n * sin(7*m) + m**2 * cos(6*n)", variables=["m", "n"])
        n * sympy.sin(m * 7) + m * m * sympy.cos(n * 6)
        >>> convert_string_to_sympy("-infty")
        -sympy.oo
        >>> convert_string_to_sympy("z**2 + y - x", variables=["x", "y", "z"], allow_complex=True, assumptions={"x": {"positive": False}, "z": {"complex": True}})

    Returns:
        A sympy expression.
    """
    try:
        return _convert_source_to_sympy(
            None,
            expr,
            variables,
            allow_hidden=allow_hidden,
            allow_sets=allow_sets,
            allow_complex=allow_complex,
            allow_trig_functions=allow_trig_functions,
            simplify_expression=simplify_expression,
            custom_functions=custom_functions,
            assumptions=assumptions,
            allow_extra_symbols=allow_extra_symbols,
        )
    except _LocalizedSympyError as exc:
        _raise_unwrapped(exc)


def _prepare_locals_for_eval(
    variables: Iterable[str] | None = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: Iterable[str] | None = None,
    assumptions: AssumptionsDictT | None = None,
) -> LocalsForEval:
    """Construct the functions, variables, and helpers used for evaluation.

    Returns:
        The functions, variables, and helpers available during evaluation.

    Raises:
        HasInvalidAssumptionError: If the assumptions are not valid.
        HasConflictingVariableError: If variable names conflict with existing names.
        HasConflictingFunctionError: If function names conflict with existing names.
    """
    if assumptions is not None:
        unbound_variables = assumptions.keys() - set(
            variables if variables is not None else []
        )
        if unbound_variables:
            raise HasInvalidAssumptionError(
                f"Assumptions for variables that are not present: {','.join(unbound_variables)}"
            )

    conflict_vars, conflict_fns, valid_names = _build_name_conflict_data(
        variables if variables is not None else [],
        custom_functions if custom_functions is not None else [],
        allow_complex=allow_complex,
        allow_hidden=allow_hidden,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
    )

    if conflict_vars:
        raise HasConflictingVariableError(
            f"Conflicting variable name(s): {', '.join(conflict_vars)}"
        )
    if conflict_fns:
        raise HasConflictingFunctionError(
            f"Conflicting function name(s): {', '.join(conflict_fns)}"
        )

    const = sympy_constants
    locals_for_eval: LocalsForEval = {
        "functions": dict(const.functions),
        "variables": dict(const.variables),
        "helpers": dict(const.helpers),
    }

    if allow_hidden:
        locals_for_eval["variables"].update(const.hidden_variables)
    if allow_complex:
        locals_for_eval["variables"].update(const.complex_variables)
        if allow_hidden:
            locals_for_eval["variables"].update(const.hidden_complex_variables)
    if allow_trig_functions:
        locals_for_eval["functions"].update(const.trig_functions)
    if allow_sets:
        locals_for_eval["functions"].update(const.set_functions)

    for name, (is_var, raw_name) in valid_names.items():
        if is_var:
            var_assumptions = (assumptions and assumptions.get(raw_name)) or {}
            locals_for_eval["variables"][name] = sympy.Symbol(name, **var_assumptions)
        else:
            locals_for_eval["functions"][name] = sympy.Function(name)

    return locals_for_eval


def _convert_source_to_sympy(
    source: sympy_source.SourceText | None,
    expr: str,
    variables: Iterable[str] | None = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
    custom_functions: Iterable[str] | None = None,
    assumptions: AssumptionsDictT | None = None,
    allow_extra_symbols: bool = False,
    normalize_input: bool = False,
    legacy_json_compatibility: bool = False,
) -> SympyValue:
    """
    Convert a string to a sympy expression, with optional restrictions on
    the variables and functions that can be used. If the string is invalid,
    raise an exception with a message that can be displayed to the user.

    Returns:
        The parsed SymPy value.

    """
    locals_for_eval = _prepare_locals_for_eval(
        variables,
        allow_hidden=allow_hidden,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
        custom_functions=custom_functions,
        assumptions=assumptions,
    )
    legacy_untyped_names: frozenset[str] = frozenset()
    legacy_untyped_functions: frozenset[str] = frozenset()
    if legacy_json_compatibility and allow_sets:
        legacy_untyped_names = frozenset(
            greek_unicode_transform(name) for name in variables or ()
        )
        legacy_untyped_functions = frozenset(
            greek_unicode_transform(name) for name in custom_functions or ()
        )

    if source is None or normalize_input:
        source = _normalize_source(
            expr,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
        )
    return _evaluate_normalized_source(
        source,
        locals_for_eval,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        simplify_expression=simplify_expression,
        allow_extra_symbols=allow_extra_symbols,
        legacy_untyped_names=legacy_untyped_names,
        legacy_untyped_functions=legacy_untyped_functions,
    )


@overload
def convert_string_to_sympy_with_source(
    expr: str,
    variables: Iterable[str] | None = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_sets: Literal[False] = False,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
    custom_functions: Iterable[str] | None = None,
    assumptions: AssumptionsDictT | None = None,
    allow_extra_symbols: bool = False,
) -> tuple[SympyExpression, str]: ...


@overload
def convert_string_to_sympy_with_source(
    expr: str,
    variables: Iterable[str] | None = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_sets: bool,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
    custom_functions: Iterable[str] | None = None,
    assumptions: AssumptionsDictT | None = None,
    allow_extra_symbols: bool = False,
) -> tuple[SympyValue, str]: ...


def convert_string_to_sympy_with_source(
    expr: str,
    variables: Iterable[str] | None = None,
    *,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
    custom_functions: Iterable[str] | None = None,
    assumptions: AssumptionsDictT | None = None,
    allow_extra_symbols: bool = False,
) -> tuple[SympyValue, str]:
    """Convert a string to a SymPy expression and return its lowered structure."""
    locals_for_eval = _prepare_locals_for_eval(
        variables,
        allow_hidden=allow_hidden,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
        custom_functions=custom_functions,
        assumptions=assumptions,
    )
    source = _normalize_source(
        expr,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )
    try:
        return _evaluate_normalized_source_with_structure(
            source,
            locals_for_eval,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            simplify_expression=simplify_expression,
            allow_extra_symbols=allow_extra_symbols,
        )
    except _LocalizedSympyError as exc:
        _raise_unwrapped(exc)


def point_to_error(expr: str, ind: int, w: int = 5) -> str:
    """Generate a string with a pointer to error in expr with index ind.

    If ind is -1, returns the full expression without a caret pointer.

    Returns:
        A string with the error location in the expression.
    """
    if ind == -1:
        return html.escape(expr)

    w_left: str = " " * (ind - max(0, ind - w))
    w_right: str = " " * (min(ind + w, len(expr)) - ind)
    initial: str = html.escape(expr[ind - len(w_left) : ind + len(w_right)])
    return f"{initial}\n{w_left}^{w_right}"


def find_symbol_offset(expr: str, symbol: str) -> int:
    """Return an approximate offset for symbol in expr for caret rendering."""
    pattern = re.compile(rf"(?<!\w){re.escape(symbol)}(?!\w)")
    ind = -1
    for match in pattern.finditer(expr):
        ind = match.start()
    if ind != -1:
        return ind
    return expr.rfind(symbol)


def _token_candidates(token: str) -> list[str]:
    candidates = [token]
    if token in sympy_constants.union_operators or token == "Union":
        candidates.extend(sympy_constants.union_operators)
    elif token in sympy_constants.intersection_operators or token == "Intersection":
        candidates.extend(sympy_constants.intersection_operators)
    return candidates


def _source_span(
    source: sympy_source.SourceText, start: int, end: int
) -> sympy_source.SourceSpan | None:
    tokens = source.tokens[start:end]
    if not tokens:
        return None
    return sympy_source.SourceSpan(tokens[0].raw_offset, tokens[-1].raw_offset + 1)


def _find_token_span(
    source: sympy_source.SourceText, token: str
) -> sympy_source.SourceSpan | None:
    best_match: re.Match[str] | None = None
    candidates = _token_candidates(token)
    for candidate in candidates:
        if not candidate:
            continue
        if candidate[0].isalnum() or candidate[0] == "_":
            pattern = re.compile(rf"(?<!\w){re.escape(candidate)}(?!\w)")
        else:
            pattern = re.compile(re.escape(candidate))
        for match in pattern.finditer(source.text):
            if best_match is None or match.start() >= best_match.start():
                best_match = match
    if best_match is None:
        for candidate in candidates:
            for match in re.finditer(re.escape(candidate), source.text):
                if best_match is None or match.start() >= best_match.start():
                    best_match = match
    if best_match is None:
        return None
    return _source_span(source, best_match.start(), best_match.end())


def _locate_error(error: _LocalizedSympyError) -> sympy_source.SourceSpan | None:
    if isinstance(error.evidence, sympy_source.SourceSpan):
        return error.evidence
    if isinstance(error.evidence, _IndexEvidence):
        return _source_span(
            error.source,
            error.evidence.index,
            error.evidence.index + 1,
        )
    if isinstance(error.evidence, _TokenEvidence):
        return _find_token_span(error.source, error.evidence.token)
    return None


def _format_parse_failure(
    localized_error: _LocalizedSympyError,
    *,
    allow_complex: bool,
) -> SympyParseFailure:
    error = localized_error.error
    source = localized_error.source
    span = _locate_error(localized_error)

    def with_location(message: str) -> SympyParseFailure:
        if span is None:
            return SympyParseFailure(message)
        return SympyParseFailure(
            f"{message} <br><br><pre>{point_to_error(source.raw_text, span.start)}</pre>"
            "Note that the location of the syntax error is approximate."
        )

    if localized_error.evaluation_failure:
        return SympyParseFailure(SYMPY_EVALUATION_ERROR_WITHOUT_LOCATION)
    if isinstance(error, HasFloatError):
        return SympyParseFailure(
            f"Your answer contains the floating-point number {error.n}. "
            "All numbers must be expressed as integers (or ratios of integers)."
        )
    if isinstance(error, HasComplexError):
        message = (
            "Your answer contains a complex number. "
            "All numbers must be expressed as integers (or ratios of integers). "
        )
        if allow_complex:
            message += (
                "To include a complex number in your expression, write it as the product "
                "of an integer with the imaginary unit <code>i</code> or <code>j</code>."
            )
        return SympyParseFailure(message)
    if isinstance(error, HasSetNotationError):
        return SympyParseFailure(
            "Your answer contains set notation, but set notation is not allowed for this question."
        )
    if isinstance(error, HasInvalidExpressionError):
        return with_location("Your answer has an invalid expression.")
    if isinstance(error, HasInvalidFunctionError):
        return with_location(f'Your answer calls an invalid function "{error.text}".')
    if isinstance(error, FunctionNameWithoutArgumentsError):
        return with_location(
            f'Your answer mentions the function "{error.text}" without applying it to anything.'
        )
    if isinstance(error, HasInvalidSymbolError):
        symbol = error.symbol
        if span is not None and isinstance(
            localized_error.evidence, (sympy_source.SourceSpan, _TokenEvidence)
        ):
            symbol = source.raw_text[span.start : span.end]
        return with_location(f'Your answer refers to an invalid symbol "{symbol}".')
    if isinstance(error, HasArgumentTypeError):
        return with_location(
            f"Your answer provides the wrong types to {error.fn}. "
            f"It was expecting {error.format_allowable_types()}, but got a {error.got} "
            f"for argument #{error.arg_idx + 1} instead."
        )
    if isinstance(error, HasFunctionArityError):
        return with_location(
            f"Your answer provides the wrong number of arguments to '{error.fn}', expected {error.expected}."
        )
    if isinstance(error, HasParseError):
        if span is None:
            return SympyParseFailure(SYMPY_PARSE_ERROR_WITHOUT_LOCATION)
        return with_location("Your answer has a syntax error.")
    if isinstance(error, HasEscapeError):
        return with_location('Your answer must not contain the character "\\".')
    if isinstance(error, HasCommentError):
        return with_location('Your answer must not contain the character "#".')
    if isinstance(error, HasConflictingVariableError):
        return SympyParseFailure(
            f"Question configuration error: {error}. "
            "The variable list contains a name that conflicts with a built-in constant. "
            "Please contact the course staff."
        )
    if isinstance(error, HasConflictingFunctionError):
        return SympyParseFailure(
            f"Question configuration error: {error}. "
            "The custom function list contains a name that conflicts with a built-in function. "
            "Please contact the course staff."
        )
    if isinstance(error, HasInvalidAssumptionError):
        return SympyParseFailure(
            f"Question configuration error: {error}. Please contact the course staff."
        )
    return SympyParseFailure(
        f"Unexpected error: {error}. Please contact the course staff."
    )


def sympy_to_json(
    a: sympy.Expr | sympy.Set,
    *,
    allow_complex: bool = True,
    allow_trig_functions: bool = True,
    allow_sets: bool = False,
) -> SympyJson:
    """Convert a SymPy expression to a JSON-seralizable dictionary.

    Returns:
        A JSON-serializable representation of the SymPy expression.

    Raises:
        HasSetNotationError: If the expression is a set and `allow_sets` is `False`.
    """
    if isinstance(a, sympy.Set) and not allow_sets:
        raise HasSetNotationError

    return _sympy_to_json_impl(
        a,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig_functions,
        allow_sets=allow_sets,
    )


def _sympy_to_json_impl(
    a: SympyValue,
    *,
    allow_complex: bool,
    allow_trig_functions: bool,
    allow_sets: bool,
    validate: Callable[[SympyValue], None] | None = None,
) -> SympyJson:
    if isinstance(a, sympy.Set) and not allow_sets:
        raise HasSetNotationError

    const = sympy_constants

    # Get list of variables in the sympy expression
    variables = list(map(str, a.free_symbols))

    # Get reserved variables for custom function parsing
    reserved = get_builtin_constants(
        allow_complex=allow_complex, allow_hidden=True
    ) | get_builtin_functions(
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
    )

    # Apply substitutions for hidden variables
    a_sub = a.subs([
        (val, sympy.symbols(key)) for key, val in const.hidden_variables.items()
    ])
    if allow_complex:
        a_sub = a_sub.subs([
            (val, sympy.symbols(key))
            for key, val in const.hidden_complex_variables.items()
        ])
    if validate is not None:
        validate(a_sub)

    assumptions_dict = {
        str(variable): variable.assumptions0 for variable in a.free_symbols
    }

    # Don't check for conflicts here, that happens in parsing.
    function_atoms = a.atoms(sympy.Function)
    functions_set = {str(func_obj.func) for func_obj in function_atoms}
    legacy_custom_function_overrides = {
        name
        for func_obj in function_atoms
        if _allows_legacy_custom_function_override(name := str(func_obj.func))
        and func_obj.func != const.set_functions[name]
    }
    custom_functions = list(
        (functions_set - reserved) | legacy_custom_function_overrides
    )

    return {
        "_type": "sympy",
        "_value": _SympyJsonStrPrinter().doprint(a_sub),
        "_variables": variables,
        "_assumptions": assumptions_dict,
        "_custom_functions": custom_functions,
    }


@overload
def json_to_sympy(
    sympy_expr_dict: SympyJson,
    *,
    allow_sets: Literal[False] = False,
    allow_complex: bool = True,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
) -> SympyExpression: ...


@overload
def json_to_sympy(
    sympy_expr_dict: SympyJson,
    *,
    allow_sets: bool,
    allow_complex: bool = True,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
) -> SympyValue: ...


def json_to_sympy(
    sympy_expr_dict: SympyJson,
    *,
    allow_sets: bool = False,
    allow_complex: bool = True,
    allow_trig_functions: bool = True,
    simplify_expression: bool = True,
) -> SympyValue:
    """Convert a json-seralizable dictionary created by [sympy_to_json][prairielearn.sympy_utils.sympy_to_json] to a SymPy expression.

    Returns:
        A SymPy expression.

    Raises:
        ValueError: If the input is not a valid SymPy JSON dict.
    """
    if "_type" not in sympy_expr_dict:
        raise ValueError("json must have key _type for conversion to sympy")
    if sympy_expr_dict["_type"] != "sympy":
        raise ValueError('json must have _type == "sympy" for conversion to sympy')
    if "_value" not in sympy_expr_dict:
        raise ValueError("json must have key _value for conversion to sympy")
    if "_variables" not in sympy_expr_dict:
        sympy_expr_dict["_variables"] = None

    variables = sympy_expr_dict["_variables"]
    try:
        return _convert_source_to_sympy(
            None,
            sympy_expr_dict["_value"],
            variables,
            allow_hidden=True,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig_functions,
            simplify_expression=simplify_expression,
            custom_functions=sympy_expr_dict.get("_custom_functions"),
            assumptions=sympy_expr_dict.get("_assumptions"),
            legacy_json_compatibility=True,
        )
    except _LocalizedSympyError as exc:
        _raise_unwrapped(exc)


@overload
def try_parse_string_as_sympy(
    expr: str,
    variables: Iterable[str] | None,
    *,
    allow_complex: bool = False,
    allow_hidden: bool = False,
    allow_sets: Literal[False] = False,
    allow_trig_functions: bool = True,
    custom_functions: list[str] | None = None,
    imaginary_unit: str | None = None,
    simplify_expression: bool = True,
    assumptions: AssumptionsDictT | None = None,
    allowed_types: set[AllowedSympyType] | None = None,
) -> SympyParseResult[SympyExpression]: ...


@overload
def try_parse_string_as_sympy(
    expr: str,
    variables: Iterable[str] | None,
    *,
    allow_complex: bool = False,
    allow_hidden: bool = False,
    allow_sets: bool,
    allow_trig_functions: bool = True,
    custom_functions: list[str] | None = None,
    imaginary_unit: str | None = None,
    simplify_expression: bool = True,
    assumptions: AssumptionsDictT | None = None,
    allowed_types: set[AllowedSympyType] | None = None,
) -> SympyParseResult[SympyValue]: ...


def try_parse_string_as_sympy(
    expr: str,
    variables: Iterable[str] | None,
    *,
    allow_complex: bool = False,
    allow_hidden: bool = False,
    allow_sets: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: list[str] | None = None,
    # Retained for backwards compatibility with existing callers.
    imaginary_unit: str | None = None,  # ruff:ignore[unused-function-argument]
    simplify_expression: bool = True,
    assumptions: AssumptionsDictT | None = None,
    allowed_types: set[AllowedSympyType] | None = None,
) -> SympyParseResult[SympyExpression] | SympyParseResult[SympyValue]:
    """Try to parse expr as a SymPy expression.

    Returns:
        A parsed SymPy expression on success, or a formatted error message on failure.

    Example::

        result = try_parse_string_as_sympy("x + 1", ["x"])
        if isinstance(result, SympyParseFailure):
            print(result.error)
        else:
            print(result.expr)
    """
    if allowed_types is None:
        allowed_types = {"all"} if allow_sets else {"expression"}

    source = sympy_source.SourceText.from_text(expr)

    return _try_parse_as_sympy(
        source,
        lambda: _convert_source_to_sympy(
            source,
            expr,
            variables,
            allow_hidden=allow_hidden,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            allow_trig_functions=allow_trig_functions,
            custom_functions=custom_functions,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
            normalize_input=True,
        ),
        allow_complex=allow_complex,
        allowed_types=allowed_types,
    )


def _try_parse_as_sympy[T: SympyValue](
    source: sympy_source.SourceText,
    parse: Callable[[], T],
    *,
    allow_complex: bool,
    allowed_types: set[AllowedSympyType] | None = None,
) -> SympyParseResult[T]:
    try:
        expr_parsed = parse()
    except _LocalizedSympyError as exc:
        return _format_parse_failure(
            exc,
            allow_complex=allow_complex,
        )
    except BaseSympyError as exc:
        return _format_parse_failure(
            _LocalizedSympyError(
                exc,
                source,
                _default_error_evidence(exc),
                cause=exc.__cause__,
            ),
            allow_complex=allow_complex,
        )
    except Exception as exc:
        return SympyParseFailure(
            f"Unexpected error: {exc}. Please contact the course staff."
        )

    if allowed_types is None:
        allowed_types = {"all"}

    type_failure = check_sympy_types(expr_parsed, allowed_types)
    if type_failure is not None:
        return type_failure

    return SympyParseSuccess(expr_parsed)


@dataclass(frozen=True, slots=True)
class _SymbolicInputNormalizationError(Exception):
    message: str


@dataclass(frozen=True, slots=True)
class _UnsupportedSympyJsonNodeError(Exception):
    node_type: type[sympy.Basic]


@dataclass(frozen=True, slots=True)
class _SymbolicSubmissionParseSuccess:
    expr: SympyValue | Literal[""]
    json: SympyJson | Literal[""]


type _SymbolicInputNormalizationResult = sympy_source.SourceText | SympyParseFailure
type _SymbolicSubmissionParseResult = (
    _SymbolicSubmissionParseSuccess | SympyParseFailure
)


def _allowed_sympy_types_include_sets(
    allowed_types: set[AllowedSympyType],
) -> bool:
    return not allowed_types.isdisjoint({"all", "set", "finite-set", "interval"})


def _validate_symbolic_submission_json_value(expr: SympyValue) -> None:
    """Validate that the SymPy JSON printer only emits supported structures."""
    pending: list[sympy.Basic] = [expr]
    while pending:
        node = pending.pop()

        if isinstance(node, sympy.Float):
            raise _UnsupportedSympyJsonNodeError(type(node))
        if (
            isinstance(node, (sympy.Symbol, sympy.Number, sympy.NumberSymbol))
            or node is sympy.I
            or node is sympy.zoo
            or any(node is domain for domain in sympy_constants.set_domains)
            or node is sympy.EmptySet
        ):
            continue

        if isinstance(node, sympy.Interval):
            pending.extend((node.start, node.end))
            continue
        if isinstance(
            node,
            (
                sympy.Add,
                sympy.Mul,
                sympy.Pow,
                sympy.Function,
                sympy.Max,
                sympy.Min,
                sympy.FiniteSet,
                sympy.Union,
                sympy.Intersection,
                sympy.Complement,
            ),
        ):
            pending.extend(node.args)
            continue
        raise _UnsupportedSympyJsonNodeError(type(node))


def _serialize_symbolic_submission(
    expr: SympyValue,
    *,
    allow_complex: bool,
    allow_sets: bool,
) -> SympyJson:
    return _sympy_to_json_impl(
        expr,
        allow_complex=allow_complex,
        allow_trig_functions=True,
        allow_sets=allow_sets,
        validate=_validate_symbolic_submission_json_value,
    )


_PLUS_MINUS_LATEX_PATTERN = re.compile(r"\\pm(?![a-zA-Z])|\+[{}]*-")


def _restore_plus_minus_source(
    source: sympy_source.SourceText, latex: str
) -> sympy_source.SourceText | None:
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

    tokens: list[sympy_source.SourceToken] = []
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


def _delete_literal(
    source: sympy_source.SourceText, literal: str
) -> sympy_source.SourceText:
    tokens: list[sympy_source.SourceToken] = []
    last_end = 0
    for match in re.finditer(re.escape(literal), source.text):
        tokens.extend(source.tokens[last_end : match.start()])
        last_end = match.end()
    tokens.extend(source.tokens[last_end:])
    return source.replace(tokens)


def _replace_editor_operators(
    source: sympy_source.SourceText,
) -> sympy_source.SourceText:
    text = source.text
    tokens: list[sympy_source.SourceToken] = []
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
        list(sympy_constants.standard_operators)
        + list(
            get_builtin_functions(
                allow_trig_functions=allow_trig_functions,
                allow_sets=allow_sets,
            )
        )
        + list(custom_functions)
        + list(variables)
    )
    tokens += [
        greek_unicode_transform(token)
        for token in tokens
        if greek_unicode_transform(token) != token
    ]
    return [token for token in tokens if len(token) > 1 and token != "**"]


def _merge_spaced_source(
    source: sympy_source.SourceText, tokens: Sequence[str]
) -> sympy_source.SourceText:
    spaced = [(token, " ".join(token)) for token in tokens]
    spaced.sort(key=lambda item: -len(item[1]))

    merged_tokens: list[sympy_source.SourceToken] = []
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
    source: sympy_source.SourceText, protected_tokens: Sequence[str]
) -> sympy_source.SourceText:
    text = source.text
    protected_positions: set[int] = set()
    for token in protected_tokens:
        if not re.search(r"\d", token):
            continue
        for match in re.finditer(re.escape(token), text):
            protected_positions.update(range(match.start(), match.end()))

    tokens: list[sympy_source.SourceToken] = []
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
    source: sympy_source.SourceText, function_names: frozenset[str]
) -> sympy_source.SourceText:
    if not function_names:
        return source
    text = source.text
    pattern = _bare_function_token_pattern(function_names)
    # Each "(" sorts before a ")" at the same index, which only happens for an
    # empty argument.
    insertions: list[tuple[int, sympy_source.SourceToken]] = []
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

    tokens: list[sympy_source.SourceToken] = []
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
    source: sympy_source.SourceText,
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    allow_trig_functions: bool,
    allow_sets: bool,
) -> sympy_source.SourceText:
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
        greek_unicode_transform(name)
        for name in (
            get_builtin_callable_functions(
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
    source: sympy_source.SourceText, *, allow_sets: bool
) -> sympy_source.SourceText:
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
        raise _SymbolicInputNormalizationError(
            f"The absolute value bars in your answer are mismatched or ambiguous: <code>{original_text}</code>."
        )
    return source.replace(tokens)


def _normalize_symbolic_input(
    text: str,
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    formula_editor: bool,
    latex: str | None,
    allow_trig_functions: bool,
    allow_complex: bool,
    allow_sets: bool,
) -> sympy_source.SourceText:
    """Normalize a symbolic-input submission in its required transformation order."""
    source = _normalize_unicode_source(
        sympy_source.SourceText.from_text(text), formula_editor=formula_editor
    )
    if formula_editor:
        if latex is not None:
            restored = _restore_plus_minus_source(source, latex)
            if restored is None:
                raise _SymbolicInputNormalizationError(
                    SYMPY_PARSE_ERROR_WITHOUT_LOCATION
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
    return _validate_and_rewrite_source(
        source,
        allow_complex=allow_complex,
        allow_sets=True,
    )


def _try_normalize_symbolic_input(
    text: str,
    variables: Sequence[str],
    custom_functions: Sequence[str],
    *,
    formula_editor: bool,
    latex: str | None,
    allow_trig_functions: bool,
    allow_complex: bool,
    allow_sets: bool,
) -> _SymbolicInputNormalizationResult:
    """Normalize a submission, returning existing user-facing parse failures."""
    try:
        return _normalize_symbolic_input(
            text,
            variables,
            custom_functions,
            formula_editor=formula_editor,
            latex=latex,
            allow_trig_functions=allow_trig_functions,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
        )
    except _SymbolicInputNormalizationError as exc:
        return SympyParseFailure(exc.message)
    except BaseSympyError as exc:

        def raise_normalization_error(
            error: BaseSympyError = exc,
        ) -> sympy.Expr:
            raise error

        result = _try_parse_as_sympy(
            sympy_source.SourceText.from_text(text),
            raise_normalization_error,
            allow_complex=allow_complex,
        )
        assert isinstance(result, SympyParseFailure)
        return result


def _try_parse_normalized_source_as_sympy(
    source: sympy_source.SourceText,
    variables: Iterable[str] | None,
    *,
    allow_complex: bool = False,
    allow_hidden: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: list[str] | None = None,
    simplify_expression: bool = True,
    assumptions: AssumptionsDictT | None = None,
    allowed_types: set[AllowedSympyType] | None = None,
) -> SympyParseResult:
    """Parse text that has already passed through symbolic-input normalization."""
    return _try_parse_as_sympy(
        source,
        lambda: _convert_source_to_sympy(
            source,
            source.raw_text,
            variables,
            allow_hidden=allow_hidden,
            allow_complex=allow_complex,
            allow_sets=True,
            allow_trig_functions=allow_trig_functions,
            custom_functions=custom_functions,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
        ),
        allow_complex=allow_complex,
        allowed_types=allowed_types,
    )


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
    assumptions: AssumptionsDictT | None = None,
    allowed_types: set[AllowedSympyType] | None = None,
) -> _SymbolicSubmissionParseResult:
    """Normalize, parse, and serialize a symbolic element submission."""
    if allowed_types is None:
        allowed_types = {"expression"}
    supports_set_syntax = _allowed_sympy_types_include_sets(allowed_types)

    if submission is None:
        return SympyParseFailure("No submitted answer.")

    variable_list = list(variables or ())
    custom_function_list = list(custom_functions)
    normalized = _try_normalize_symbolic_input(
        submission,
        variable_list,
        custom_function_list,
        formula_editor=formula_editor,
        latex=formula_editor_latex,
        allow_trig_functions=allow_trig_functions,
        allow_complex=allow_complex,
        allow_sets=supports_set_syntax,
    )
    if isinstance(normalized, SympyParseFailure):
        return normalized

    if not normalized.text.strip():
        if not allow_blank:
            return SympyParseFailure("No submitted answer.")
        if not blank_value.strip():
            return _SymbolicSubmissionParseSuccess("", "")
        result = try_parse_string_as_sympy(
            blank_value,
            variable_list,
            allow_hidden=True,
            allow_complex=allow_complex,
            allow_sets=True,
            allow_trig_functions=allow_trig_functions,
            imaginary_unit=imaginary_unit,
            custom_functions=custom_function_list,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
            allowed_types=allowed_types,
        )
    else:
        result = _try_parse_normalized_source_as_sympy(
            normalized,
            variable_list,
            allow_hidden=True,
            allow_complex=allow_complex,
            allow_trig_functions=allow_trig_functions,
            custom_functions=custom_function_list,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
            allowed_types=allowed_types,
        )
    if isinstance(result, SympyParseFailure):
        return result

    try:
        submission_json = _serialize_symbolic_submission(
            result.expr,
            allow_complex=allow_complex,
            allow_sets=supports_set_syntax,
        )
    except _UnsupportedSympyJsonNodeError as exc:
        if issubclass(exc.node_type, sympy.AccumBounds):
            return SympyParseFailure(
                "Your answer simplifies to a range of possible values, which is not "
                f"supported: $${sympy.latex(result.expr)}$$"
            )
        return SympyParseFailure(
            "Your answer was simplified to this, which contains an unsupported "
            f"expression: $${sympy.latex(result.expr)}$$"
        )
    except Exception:
        return SympyParseFailure(
            "Your answer was simplified to this, which contains an invalid expression: "
            f"$${sympy.latex(result.expr)}$$"
        )
    return _SymbolicSubmissionParseSuccess(result.expr, submission_json)


def validate_string_as_sympy(
    expr: str,
    variables: Iterable[str] | None,
    *,
    allow_sets: bool = False,
    allow_hidden: bool = False,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: list[str] | None = None,
    imaginary_unit: str | None = None,
    simplify_expression: bool = True,
    assumptions: AssumptionsDictT | None = None,
    allowed_types: set[AllowedSympyType] | None = None,
) -> str | None:
    """Try to parse expr as a SymPy expression.

    Returns:
        `None` if the expression is valid, and an error message otherwise.
    """
    result = try_parse_string_as_sympy(
        expr,
        variables,
        allow_hidden=allow_hidden,
        allow_sets=allow_sets,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig_functions,
        custom_functions=custom_functions,
        imaginary_unit=imaginary_unit,
        simplify_expression=simplify_expression,
        assumptions=assumptions,
        allowed_types=allowed_types,
    )

    if isinstance(result, SympyParseFailure):
        return result.error

    return None


def get_items_list(items_string: str | None) -> list[str]:
    """Return a list of items from a comma-separated string."""
    if items_string is None:
        return []

    return list(map(str.strip, items_string.split(",")))


def _split_mangled_binop(binops: Sequence[str], text: str) -> tuple[str, str] | None:
    r"""Returns (op, num_text) if text is <op>\d+"""
    if text not in binops:
        stripped = text.rstrip(string.digits)
        if stripped in binops:
            return stripped, text[len(stripped) :]
    return None


def get_builtin_constants(
    *, allow_complex: bool = False, allow_hidden: bool = True
) -> set[str]:
    """Return the set of built-in constant names.

    Parameters:
        allow_complex: Whether to include complex number constants (i, j).
        allow_hidden: Whether to include sympy's longer name for constants.

    Returns:
        A set of built-in constant names.
    """
    const = sympy_constants
    names = set(const.variables.keys())
    if allow_complex:
        names |= const.complex_variables.keys()
    if allow_hidden:
        names.update(const.hidden_variables.keys())
    if allow_complex and allow_hidden:
        names.update(const.hidden_complex_variables.keys())
    return names


def get_builtin_callable_functions(
    *,
    allow_trig_functions: bool = True,
    allow_sets: bool = False,
    include_helpers: bool = True,
) -> set[str]:
    """Return the set of built-in callable function names.

    Parameters:
        allow_trig_functions: Whether to include trigonometric functions.
        allow_sets: Whether to include set constructors.
        include_helpers: Whether to include internal parsing helpers.

    Returns:
        A set of built-in callable function names.
    """
    const = sympy_constants
    names = set(const.functions)
    if include_helpers:
        names.update(const.helpers)
    if allow_trig_functions:
        names.update(const.trig_functions)
    if allow_sets:
        names.update(const.set_functions)
    return names


def get_builtin_functions(
    *, allow_trig_functions: bool = True, allow_sets: bool = False
) -> set[str]:
    """Return the set of built-in function and operator names.

    Parameters:
        allow_trig_functions: Whether to include trigonometric functions.
        allow_sets: Whether to include set operators and constructors.

    Returns:
        A set of built-in function and operator names.
    """
    const = sympy_constants
    names = get_builtin_callable_functions(
        allow_trig_functions=allow_trig_functions,
        allow_sets=allow_sets,
    )
    if allow_sets:
        names |= const.set_operator_names
    return names


def _build_name_conflict_data(
    variables: Iterable[str],
    custom_functions: Iterable[str],
    *,
    allow_complex: bool,
    allow_hidden: bool,
    allow_trig_functions: bool,
    allow_sets: bool,
) -> tuple[list[str], list[str], dict[str, tuple[bool, str]]]:
    """Validate that user-specified names don't conflict with built-in constants or functions.

    Parameters:
        element_name: Name of the element (for error messages).
        variables: User-specified variable names.
        custom_functions: User-specified custom function names.
        allow_complex: Whether complex constants (i, j) are available.
        allow_hidden: Whether sympy's long-form names for constants are available.
        allow_sets: Whether set operations are available.
        allow_trig_functions: Whether trig functions are available.

    Returns:
        A list of (var_names, fun_names, valid_sanitized_names) where var/fun_names conflict
        with builtins or themselves and valid_sanitized_names maps `sanitized_unique_name ->
        (was_variable, unsanitized)`.
    """
    builtins = get_builtin_functions(
        allow_trig_functions=allow_trig_functions,
        allow_sets=allow_sets,
    ) | get_builtin_constants(
        allow_complex=allow_complex,
        allow_hidden=allow_hidden,
    )
    set_ops = tuple(sympy_constants.set_operator_names)

    def _conflicts(name: str) -> bool:
        if name in builtins:
            return True
        return allow_sets and _split_mangled_binop(set_ops, name) is not None

    valid_names: dict[str, tuple[bool, str]] = {}
    conflict_vars: list[str] = []
    conflict_fns: list[str] = []

    for raw in variables:
        sanitized = greek_unicode_transform(raw)
        if sanitized in valid_names or _conflicts(sanitized):
            conflict_vars.append(raw)
        else:
            valid_names[sanitized] = (True, raw)

    for raw in custom_functions:
        sanitized = greek_unicode_transform(raw)
        if sanitized in valid_names or (
            _conflicts(sanitized)
            and not _allows_legacy_custom_function_override(sanitized)
        ):
            conflict_fns.append(raw)
        else:
            valid_names[sanitized] = (False, raw)

    return conflict_vars, conflict_fns, valid_names


def validate_names_for_conflicts(
    element_name: str,
    variables: list[str],
    custom_functions: list[str],
    *,
    allow_complex: bool = False,
    allow_hidden_variables: bool = True,
    allow_trig_functions: bool = True,
    allow_sets: bool = False,
) -> None:
    """Validate that user-specified names don't conflict with built-in constants or functions.

    Parameters:
        element_name: Name of the element (for error messages).
        variables: User-specified variable names.
        custom_functions: User-specified custom function names.
        allow_complex: Whether complex constants (i, j) are available.
        allow_hidden_variables: Whether sympy's long-form names for constants are available.
        allow_sets: Whether set operations are available.
        allow_trig_functions: Whether trig functions are available.

    Raises:
        ValueError: If any names conflict with built-ins.
    """
    v_conflicts, f_conflicts, _valid = _build_name_conflict_data(
        variables,
        custom_functions,
        allow_complex=allow_complex,
        allow_hidden=allow_hidden_variables,
        allow_sets=allow_sets,
        allow_trig_functions=allow_trig_functions,
    )
    conflicts = v_conflicts + f_conflicts
    if conflicts:
        raise ValueError(
            f'Element "{element_name}" specifies names that conflict with built-ins: '
            f"{', '.join(conflicts)}. These are automatically available and should not be listed."
        )


def greek_unicode_transform(input_str: str) -> str:
    """Return input_str where all unicode greek letters are replaced by their spelled-out english names."""
    return input_str.translate(sympy_constants.greek_alphabet)
