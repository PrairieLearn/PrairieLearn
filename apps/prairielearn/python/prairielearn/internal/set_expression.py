"""Dedicated grammar and evaluator for symbolic set expressions."""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from importlib.resources import files
from typing import TYPE_CHECKING, cast

import sympy
from lark import Lark, Token, Transformer
from lark.exceptions import UnexpectedInput, UnexpectedToken

import prairielearn.sympy_utils as psu

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence


NAMED_SETS = {
    "R": sympy.S.Reals,
    "Q": sympy.S.Rationals,
    "Z": sympy.S.Integers,
    "N": sympy.S.Naturals,
    "C": sympy.S.Complexes,
}
NAMED_SET_NAMES = frozenset(NAMED_SETS)


@dataclass(frozen=True, slots=True)
class SetParseSuccess:
    expr: sympy.Set
    json: psu.SympyJson


@dataclass(frozen=True, slots=True)
class SetParseFailure:
    error: str


type SetParseResult = SetParseSuccess | SetParseFailure


@dataclass(frozen=True, slots=True)
class _SourceSpan:
    start: int
    end: int


@dataclass(frozen=True, slots=True)
class _Token:
    text: str
    source_start: int
    source_end: int
    span: _SourceSpan


@dataclass(frozen=True, slots=True)
class _Scalar:
    source_start: int
    source_end: int
    span: _SourceSpan


@dataclass(frozen=True, slots=True)
class _FiniteSet:
    items: tuple[_SetExpression | _Scalar, ...]
    span: _SourceSpan


@dataclass(frozen=True, slots=True)
class _Interval:
    left: _Scalar
    right: _Scalar
    left_bracket: _Token
    right_bracket: _Token
    span: _SourceSpan


@dataclass(frozen=True, slots=True)
class _NamedSet:
    name: str
    span: _SourceSpan


@dataclass(frozen=True, slots=True)
class _SetBinary:
    left: _SetExpression
    operator: _Token
    right: _SetExpression
    span: _SourceSpan


@dataclass(frozen=True, slots=True)
class _SetGroup:
    value: _SetExpression
    span: _SourceSpan


type _SetExpression = _FiniteSet | _Interval | _NamedSet | _SetBinary | _SetGroup
type _SetItem = _SetExpression | _Scalar
type _SetItems = tuple[_SetItem, ...]
type _ScalarProductTail = tuple[_Token | None, _Scalar]
type _TransformValue = (
    _Token
    | _Scalar
    | _SetExpression
    | _SetItems
    | _ScalarProductTail
    | tuple[_Scalar, ...]
)


_GRAMMAR = (
    files("prairielearn.internal")
    .joinpath("set_expression.lark")
    .read_text(encoding="utf-8")
)
_ACTIVE_SOURCE: ContextVar[psu._SourceText] = ContextVar("set_expression_source")


def _source_span(start: int, end: int) -> _SourceSpan:
    source = _ACTIVE_SOURCE.get()
    if start == end:
        offset = (
            source.tokens[start].raw_offset
            if start < len(source.tokens)
            else len(source.raw_text)
        )
        return _SourceSpan(offset, offset)
    tokens = source.tokens[start:end]
    return _SourceSpan(tokens[0].raw_offset, tokens[-1].raw_offset + 1)


def _token_bounds(token: Token) -> tuple[int, int]:
    assert token.start_pos is not None
    assert token.end_pos is not None
    return token.start_pos, token.end_pos


def _combine(left: _SourceSpan, right: _SourceSpan) -> _SourceSpan:
    return _SourceSpan(left.start, right.end)


class _IRTransformer(Transformer[Token, _TransformValue]):
    @staticmethod
    def _token(token: Token) -> _Token:
        start, end = _token_bounds(token)
        return _Token(str(token), start, end, _source_span(start, end))

    UNION = _token
    INTERSECTION = _token
    DIFFERENCE = _token
    NAMED_SET = _token
    ADD = _token
    PRODUCT = _token
    POWER = _token
    FACTORIAL = _token
    LPAR = _token
    RPAR = _token
    LBRACKET = _token
    RBRACKET = _token
    LBRACE = _token
    RBRACE = _token
    COMMA = _token

    @staticmethod
    def NUMBER(token: Token) -> _Scalar:  # ruff:ignore[invalid-function-name]
        start, end = _token_bounds(token)
        return _Scalar(start, end, _source_span(start, end))

    @staticmethod
    def NAME(token: Token) -> _Scalar:  # ruff:ignore[invalid-function-name]
        start, end = _token_bounds(token)
        return _Scalar(start, end, _source_span(start, end))

    def start(self, items: list[_TransformValue]) -> _SetExpression:
        return cast(_SetExpression, items[0])

    @staticmethod
    def _set_chain(items: list[_TransformValue]) -> _SetExpression:
        value = cast(_SetExpression, items[0])
        for index in range(1, len(items), 2):
            operator = cast(_Token, items[index])
            right = cast(_SetExpression, items[index + 1])
            value = _SetBinary(value, operator, right, _combine(value.span, right.span))
        return value

    set_union = _set_chain
    set_intersection = _set_chain
    set_difference = _set_chain

    def set_group(self, items: list[_TransformValue]) -> _SetGroup:
        left = cast(_Token, items[0])
        value = cast(_SetExpression, items[1])
        right = cast(_Token, items[2])
        return _SetGroup(value, _combine(left.span, right.span))

    def named_set(self, items: list[_TransformValue]) -> _NamedSet:
        name = cast(_Token, items[0])
        return _NamedSet(name.text, name.span)

    def set_items(self, items: list[_TransformValue]) -> _SetItems:
        return tuple(
            cast(_SetItem, item) for item in items if not isinstance(item, _Token)
        )

    def finite_set(self, items: list[_TransformValue]) -> _FiniteSet:
        left = cast(_Token, items[0])
        right = cast(_Token, items[-1])
        values = cast(_SetItems, items[1]) if len(items) == 3 else ()
        return _FiniteSet(values, _combine(left.span, right.span))

    def interval(self, items: list[_TransformValue]) -> _Interval:
        left_bracket = cast(_Token, items[0])
        left = cast(_Scalar, items[1])
        right = cast(_Scalar, items[3])
        right_bracket = cast(_Token, items[4])
        return _Interval(
            left,
            right,
            left_bracket,
            right_bracket,
            _combine(left_bracket.span, right_bracket.span),
        )

    def scalar(self, items: list[_TransformValue]) -> _Scalar:
        value = cast(_Scalar, items[0])
        return value

    @staticmethod
    def _scalar_chain(items: list[_TransformValue]) -> _Scalar:
        left = cast(_Scalar, items[0])
        right = cast(_Scalar, items[-1])
        return _Scalar(
            left.source_start,
            right.source_end,
            _combine(left.span, right.span),
        )

    scalar_sum = _scalar_chain

    def explicit_scalar_product_tail(
        self, items: list[_TransformValue]
    ) -> _ScalarProductTail:
        return cast(_Token, items[0]), cast(_Scalar, items[1])

    def implicit_scalar_product_tail(
        self, items: list[_TransformValue]
    ) -> _ScalarProductTail:
        return None, cast(_Scalar, items[0])

    def scalar_product(self, items: list[_TransformValue]) -> _Scalar:
        left = cast(_Scalar, items[0])
        if len(items) == 1:
            return left
        _, right = cast(_ScalarProductTail, items[-1])
        return _Scalar(
            left.source_start,
            right.source_end,
            _combine(left.span, right.span),
        )

    def scalar_unary(self, items: list[_TransformValue]) -> _Scalar:
        operator = cast(_Token, items[0])
        value = cast(_Scalar, items[1])
        return _Scalar(
            operator.source_start,
            value.source_end,
            _combine(operator.span, value.span),
        )

    scalar_power = _scalar_chain

    def scalar_postfix(self, items: list[_TransformValue]) -> _Scalar:
        value = cast(_Scalar, items[0])
        if len(items) == 1:
            return value
        operator = cast(_Token, items[-1])
        return _Scalar(
            value.source_start,
            operator.source_end,
            _combine(value.span, operator.span),
        )

    def scalar_arguments(self, items: list[_TransformValue]) -> tuple[_Scalar, ...]:
        return tuple(
            cast(_Scalar, item) for item in items if not isinstance(item, _Token)
        )

    def scalar_call(self, items: list[_TransformValue]) -> _Scalar:
        name = cast(_Scalar, items[0])
        right = cast(_Token, items[-1])
        return _Scalar(
            name.source_start,
            right.source_end,
            _combine(name.span, right.span),
        )

    def scalar_group(self, items: list[_TransformValue]) -> _Scalar:
        left = cast(_Token, items[0])
        right = cast(_Token, items[2])
        return _Scalar(
            left.source_start,
            right.source_end,
            _combine(left.span, right.span),
        )


_PARSER = Lark(
    _GRAMMAR,
    parser="lalr",
    lexer="contextual",
    transformer=_IRTransformer(),
    maybe_placeholders=False,
)


def validate_names(variables: Iterable[str], custom_functions: Iterable[str]) -> None:
    """Reject instructor names that shadow the unqualified named-set syntax."""
    conflicting_variables = sorted(NAMED_SET_NAMES.intersection(variables))
    conflicting_functions = sorted(NAMED_SET_NAMES.intersection(custom_functions))
    if conflicting_variables:
        raise ValueError(
            f"Named sets cannot be used as variable names: {', '.join(conflicting_variables)}"
        )
    if conflicting_functions:
        raise ValueError(
            "Named sets cannot be used as custom function names: "
            + ", ".join(conflicting_functions)
        )


def _parse(source: psu._SourceText) -> _SetExpression:
    source_token = _ACTIVE_SOURCE.set(source)
    try:
        return cast(_SetExpression, _PARSER.parse(source.text()))
    except UnexpectedInput as exc:
        position = (
            len(source.tokens)
            if isinstance(exc, UnexpectedToken) and exc.token.type == "$END"
            else exc.pos_in_stream
        )
        if position is None or position >= len(source.tokens):
            raw_position = len(source.raw_text)
        else:
            raw_position = source.tokens[position].raw_offset
        raise _SetExpressionError(
            "Your answer has a syntax error near "
            f"<code>{psu.point_to_error(source.raw_text, raw_position)}</code>."
        ) from None
    finally:
        _ACTIVE_SOURCE.reset(source_token)


@dataclass(frozen=True, slots=True)
class _SetExpressionError(Exception):
    message: str


class _Evaluator:
    def __init__(
        self,
        source: psu._SourceText,
        variables: Sequence[str],
        custom_functions: list[str],
        *,
        allow_complex: bool,
        allow_trig_functions: bool,
        simplify_expression: bool,
        assumptions: psu.AssumptionsDictT | None,
    ) -> None:
        self.source = source
        self.variables = variables
        self.custom_functions = custom_functions
        self.allow_complex = allow_complex
        self.allow_trig_functions = allow_trig_functions
        self.simplify_expression = simplify_expression
        self.assumptions = assumptions

    def scalar(self, expression: _Scalar) -> sympy.Expr:
        text = self.source.text()[expression.source_start : expression.source_end]
        result = psu.try_parse_string_as_sympy(
            text,
            self.variables,
            allow_hidden=True,
            allow_complex=self.allow_complex,
            allow_sets=False,
            allow_trig_functions=self.allow_trig_functions,
            custom_functions=self.custom_functions,
            simplify_expression=self.simplify_expression,
            assumptions=self.assumptions,
        )
        if isinstance(result, psu.SympyParseFailure):
            raise _SetExpressionError(result.error)
        return result.expr

    def evaluate_item(self, expression: _SetItem) -> sympy.Basic:
        if isinstance(expression, _Scalar):
            return self.scalar(expression)
        return self.evaluate(expression)

    def evaluate(self, expression: _SetExpression) -> sympy.Set:
        if isinstance(expression, _NamedSet):
            return NAMED_SETS[expression.name]
        if isinstance(expression, _SetGroup):
            return self.evaluate(expression.value)
        if isinstance(expression, _FiniteSet):
            return sympy.FiniteSet(
                *(self.evaluate_item(item) for item in expression.items), evaluate=False
            )
        if isinstance(expression, _Interval):
            return sympy.Interval(
                self.scalar(expression.left),
                self.scalar(expression.right),
                left_open=expression.left_bracket.text == "(",
                right_open=expression.right_bracket.text == ")",
            )
        if isinstance(expression, _SetBinary):
            left = self.evaluate(expression.left)
            right = self.evaluate(expression.right)
            if expression.operator.text in {"U", "cup", "∪", "|", "+"}:  # ruff:ignore[ambiguous-unicode-character-string]
                return sympy.Union(left, right, evaluate=False)
            if expression.operator.text in {"cap", "∩", "&"}:
                return sympy.Intersection(left, right, evaluate=False)
            return sympy.Complement(left, right, evaluate=False)
        raise AssertionError(expression)


def is_representable_set(value: sympy.Basic) -> bool:
    """Return whether the set can round-trip through the dedicated grammar."""
    if value in NAMED_SETS.values() or value is sympy.S.EmptySet:
        return True
    if isinstance(value, sympy.Interval):
        return True
    if isinstance(value, sympy.FiniteSet):
        return all(
            not isinstance(item, sympy.Set) or is_representable_set(item)
            for item in value.args
        )
    if isinstance(value, (sympy.Union, sympy.Intersection, sympy.Complement)):
        return all(
            isinstance(item, sympy.Set) and is_representable_set(item)
            for item in value.args
        )
    return False


def try_parse_set_submission(
    submission: str | None,
    variables: Iterable[str] | None,
    *,
    formula_editor: bool = False,
    formula_editor_latex: str | None = None,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: Sequence[str] = (),
    simplify_expression: bool = True,
    assumptions: psu.AssumptionsDictT | None = None,
) -> SetParseResult:
    """Normalize, parse, evaluate, and serialize a set-only submission."""
    if submission is None or not submission.strip():
        return SetParseFailure("No submitted answer.")

    variable_list = list(variables or ())
    custom_function_list = list(custom_functions)
    try:
        validate_names(variable_list, custom_function_list)
    except ValueError as exc:
        return SetParseFailure(str(exc))

    normalized = psu._try_normalize_symbolic_input(
        submission,
        variable_list,
        custom_function_list,
        formula_editor=formula_editor,
        latex=formula_editor_latex,
        allow_trig_functions=allow_trig_functions,
        allow_complex=allow_complex,
        allow_sets=True,
    )
    if isinstance(normalized, psu.SympyParseFailure):
        return SetParseFailure(normalized.error)

    try:
        expression = _parse(normalized)
        value = _Evaluator(
            normalized,
            variable_list,
            custom_function_list,
            allow_complex=allow_complex,
            allow_trig_functions=allow_trig_functions,
            simplify_expression=simplify_expression,
            assumptions=assumptions,
        ).evaluate(expression)
        if not is_representable_set(value):
            return SetParseFailure(
                "Your answer produces a set that this input cannot represent."
            )
        result_json = psu.sympy_to_json(
            value, allow_complex=allow_complex, allow_sets=True
        )
        psu.json_to_sympy(
            result_json,
            allow_complex=allow_complex,
            allow_sets=True,
            simplify_expression=simplify_expression,
        )
    except _SetExpressionError as exc:
        return SetParseFailure(exc.message)
    except (TypeError, ValueError):
        return SetParseFailure("Your answer contains an invalid set expression.")
    return SetParseSuccess(value, result_json)
