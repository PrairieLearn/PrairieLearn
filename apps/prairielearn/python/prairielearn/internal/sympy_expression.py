"""Private grammar parser and direct evaluator for symbolic expressions."""

from __future__ import annotations

import keyword
import math
import re
import unicodedata
from contextvars import ContextVar
from dataclasses import dataclass
from importlib.resources import files
from typing import TYPE_CHECKING, Literal, Never, Protocol, cast

import sympy
from lark import Lark, Token, Transformer
from lark.exceptions import UnexpectedInput, UnexpectedToken
from sympy.logic.boolalg import Boolean

from prairielearn.internal import (
    mathjson,
    sympy_constants,
    sympy_evaluation,
    sympy_source,
)
from prairielearn.set_builder import SetBuilderSet

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

_GRAMMAR = (
    files("prairielearn").joinpath("sympy_expression.lark").read_text(encoding="utf-8")
)
type ParserStart = Literal["symbolic_start", "set_start"]


@dataclass(frozen=True, slots=True)
class _Operator:
    text: str
    span: sympy_source.SourceSpan


@dataclass(frozen=True, slots=True)
class _Number:
    text: str
    span: sympy_source.SourceSpan

    def to_structure(self) -> str:
        return self.text


@dataclass(frozen=True, slots=True)
class _Name:
    text: str
    span: sympy_source.SourceSpan
    character_spans: tuple[sympy_source.SourceSpan, ...]

    def to_structure(self) -> str:
        return self.text


@dataclass(frozen=True, slots=True)
class _Call:
    function: _Name
    arguments: tuple[_Expression, ...]
    span: sympy_source.SourceSpan

    def to_structure(self) -> str:
        arguments = ",".join(argument.to_structure() for argument in self.arguments)
        return f"{self.function.text}({arguments})"


@dataclass(frozen=True, slots=True)
class _Unary:
    operator: _Operator
    operand: _Expression
    span: sympy_source.SourceSpan

    def to_structure(self) -> str:
        return f"({self.operator.text}{self.operand.to_structure()})"


@dataclass(frozen=True, slots=True)
class _Binary:
    left: _Expression
    operator: _Operator
    right: _Expression
    span: sympy_source.SourceSpan

    def to_structure(self) -> str:
        operator = {
            "juxtapose": "*",
            "cup": "|",
            "U": "|",
            "∪": "|",  # ruff: ignore[ambiguous-unicode-character-string]
            "cap": "&",
            "∩": "&",
        }.get(self.operator.text, self.operator.text)
        return f"({self.left.to_structure()}{operator}{self.right.to_structure()})"


@dataclass(frozen=True, slots=True)
class _Factorial:
    operand: _Expression
    operator: _Operator
    span: sympy_source.SourceSpan

    def to_structure(self) -> str:
        return f"factorial({self.operand.to_structure()})"


@dataclass(frozen=True, slots=True)
class _FiniteSet:
    items: tuple[_Expression, ...]
    span: sympy_source.SourceSpan

    def to_structure(self) -> str:
        items = ",".join(item.to_structure() for item in self.items)
        return f"FiniteSet({items})"


@dataclass(frozen=True, slots=True)
class _SetBuilder:
    body: _Expression
    condition: _Expression
    span: sympy_source.SourceSpan

    def to_structure(self) -> str:
        return f"SetBuilder({self.body.to_structure()},{self.condition.to_structure()})"


@dataclass(frozen=True, slots=True)
class _Interval:
    left: _Expression
    right: _Expression
    left_bracket: _Operator
    right_bracket: _Operator
    span: sympy_source.SourceSpan

    def to_structure(self) -> str:
        left_open = self.left_bracket.text == "("
        right_open = self.right_bracket.text == ")"
        return (
            f"Interval({self.left.to_structure()},{self.right.to_structure()},"
            f"{left_open},{right_open})"
        )


@dataclass(frozen=True, slots=True)
class _Delimited:
    items: tuple[_Expression, ...]
    left_bracket: _Operator
    right_bracket: _Operator
    span: sympy_source.SourceSpan

    def to_structure(self) -> str:
        items = ",".join(item.to_structure() for item in self.items)
        return f"delimited({self.left_bracket.text}{items}{self.right_bracket.text})"


@dataclass(frozen=True, slots=True)
class _Group:
    value: _Expression
    span: sympy_source.SourceSpan

    def to_structure(self) -> str:
        return f"group({self.value.to_structure()})"


type _Expression = (
    _Number
    | _Name
    | _Call
    | _Unary
    | _Binary
    | _Factorial
    | _FiniteSet
    | _SetBuilder
    | _Interval
    | _Delimited
    | _Group
)


def _combine(
    left: sympy_source.SourceSpan, right: sympy_source.SourceSpan
) -> sympy_source.SourceSpan:
    return sympy_source.SourceSpan(left.start, right.end)


type _ProductTail = tuple[_Operator, _Expression]
type _Arguments = tuple[_Expression, ...]
type _TransformValue = _Expression | _Operator | _ProductTail | _Arguments


class _SupportsInvert(Protocol):
    def __invert__(self) -> object: ...


_ACTIVE_SOURCE: ContextVar[sympy_source.MappedText] = ContextVar(
    "sympy_expression_source"
)


def _source_span(start: int, end: int) -> sympy_source.SourceSpan:
    source = _ACTIVE_SOURCE.get()
    if start == end:
        offset = (
            source.chars[start].raw_offset
            if start < len(source.chars)
            else len(source.raw_text)
        )
        return sympy_source.SourceSpan(offset, offset)
    tokens = source.chars[start:end]
    return sympy_source.SourceSpan(tokens[0].raw_offset, tokens[-1].raw_offset + 1)


def _token_bounds(token: Token) -> tuple[int, int]:
    assert token.start_pos is not None
    assert token.end_pos is not None
    return token.start_pos, token.end_pos


class _IRTransformer(Transformer[Token, _TransformValue]):
    @staticmethod
    def NUMBER(token: Token) -> _Number:  # ruff: ignore[invalid-function-name]
        start, end = _token_bounds(token)
        return _Number(str(token), _source_span(start, end))

    @staticmethod
    def NAME(token: Token) -> _Name:  # ruff: ignore[invalid-function-name]
        start, end = _token_bounds(token)
        return _Name(
            str(token),
            _source_span(start, end),
            tuple(_source_span(index, index + 1) for index in range(start, end)),
        )

    NAMED_SET = NAME

    @staticmethod
    def _operator_token(token: Token) -> _Operator:
        return _Operator(str(token), _source_span(*_token_bounds(token)))

    UNION = _operator_token
    SET_UNION = _operator_token
    INTERSECTION = _operator_token
    SET_DIFFERENCE = _operator_token
    ADD = _operator_token
    INVERT = _operator_token
    PRODUCT = _operator_token
    POWER = _operator_token
    FACTORIAL = _operator_token
    LPAR = _operator_token
    RPAR = _operator_token
    LBRACKET = _operator_token
    RBRACKET = _operator_token
    LBRACE = _operator_token
    RBRACE = _operator_token

    def symbolic_start(self, items: list[_TransformValue]) -> _Expression:
        return cast(_Expression, items[0])

    def set_start(self, items: list[_TransformValue]) -> _Expression:
        return cast(_Expression, items[0])

    def scalar(self, items: list[_TransformValue]) -> _Expression:
        return cast(_Expression, items[0])

    def named_set(self, items: list[_TransformValue]) -> _Expression:
        return cast(_Expression, items[0])

    @staticmethod
    def _chain(items: list[_TransformValue]) -> _Expression:
        value = cast(_Expression, items[0])
        for index in range(1, len(items), 2):
            operator = cast(_Operator, items[index])
            right = cast(_Expression, items[index + 1])
            value = _Binary(value, operator, right, _combine(value.span, right.span))
        return value

    union = _chain
    intersection = _chain
    sum = _chain
    set_union = _chain
    set_intersection = _chain
    set_difference = _chain

    def explicit_product_tail(self, items: list[_TransformValue]) -> _ProductTail:
        return cast(_Operator, items[0]), cast(_Expression, items[1])

    def implicit_product_tail(self, items: list[_TransformValue]) -> _ProductTail:
        right = cast(_Expression, items[0])
        operator = _Operator(
            "juxtapose",
            sympy_source.SourceSpan(right.span.start, right.span.start),
        )
        return operator, right

    def product(self, items: list[_TransformValue]) -> _Expression:
        value = cast(_Expression, items[0])
        for item in items[1:]:
            operator, right = cast(_ProductTail, item)
            value = _Binary(value, operator, right, _combine(value.span, right.span))
        return value

    def unary(self, items: list[_TransformValue]) -> _Unary:
        operator = cast(_Operator, items[0])
        operand = cast(_Expression, items[1])
        return _Unary(operator, operand, _combine(operator.span, operand.span))

    def power(self, items: list[_TransformValue]) -> _Expression:
        value = cast(_Expression, items[0])
        if len(items) == 1:
            return value
        operator = cast(_Operator, items[1])
        right = cast(_Expression, items[2])
        return _Binary(value, operator, right, _combine(value.span, right.span))

    def postfix(self, items: list[_TransformValue]) -> _Expression:
        value = cast(_Expression, items[0])
        for item in items[1:]:
            operator = cast(_Operator, item)
            value = _Factorial(value, operator, _combine(value.span, operator.span))
        return value

    def arguments(self, items: list[_TransformValue]) -> _Arguments:
        return tuple(cast(_Expression, item) for item in items)

    def call(self, items: list[_TransformValue]) -> _Call:
        function = cast(_Name, items[0])
        right_parenthesis = cast(_Operator, items[-1])
        arguments = cast(_Arguments, items[2]) if len(items) == 4 else ()
        return _Call(
            function,
            arguments,
            sympy_source.SourceSpan(function.span.start, right_parenthesis.span.end),
        )

    def group(self, items: list[_TransformValue]) -> _Group:
        left_parenthesis = cast(_Operator, items[0])
        value = cast(_Expression, items[1])
        right_parenthesis = cast(_Operator, items[2])
        return _Group(
            value,
            sympy_source.SourceSpan(
                left_parenthesis.span.start, right_parenthesis.span.end
            ),
        )

    def set_literal(self, items: list[_TransformValue]) -> _FiniteSet:
        left_brace = cast(_Operator, items[0])
        right_brace = cast(_Operator, items[-1])
        values = cast(_Arguments, items[1]) if len(items) == 3 else ()
        return _FiniteSet(
            values,
            sympy_source.SourceSpan(left_brace.span.start, right_brace.span.end),
        )

    def interval(self, items: list[_TransformValue]) -> _Interval:
        left_bracket = cast(_Operator, items[0])
        left = cast(_Expression, items[1])
        right = cast(_Expression, items[2])
        right_bracket = cast(_Operator, items[3])
        return _Interval(
            left,
            right,
            left_bracket,
            right_bracket,
            sympy_source.SourceSpan(left_bracket.span.start, right_bracket.span.end),
        )

    def delimited(self, items: list[_TransformValue]) -> _Delimited:
        left_bracket = cast(_Operator, items[0])
        right_bracket = cast(_Operator, items[-1])
        values = tuple(cast(_Expression, item) for item in items[1:-1])
        return _Delimited(
            values,
            left_bracket,
            right_bracket,
            sympy_source.SourceSpan(left_bracket.span.start, right_bracket.span.end),
        )


_PARSER = Lark(
    _GRAMMAR,
    parser="lalr",
    lexer="contextual",
    transformer=_IRTransformer(),
    maybe_placeholders=False,
    start=["symbolic_start", "set_start"],
)


def _parse(
    source: sympy_source.MappedText, start: ParserStart = "symbolic_start"
) -> _Expression:
    source_token = _ACTIVE_SOURCE.set(source)
    try:
        return cast(_Expression, _PARSER.parse(source.text(), start=start))
    except UnexpectedInput as exc:
        position = (
            len(source.chars)
            if isinstance(exc, UnexpectedToken) and exc.token.type == "$END"
            else exc.pos_in_stream
        )
        if position is None:
            position = len(source.chars)
        if position < len(source.chars):
            span = sympy_source.SourceSpan(
                source.chars[position].raw_offset,
                source.chars[position].raw_offset + 1,
            )
        else:
            span = sympy_source.SourceSpan(len(source.raw_text), len(source.raw_text))
        raise sympy_evaluation.ExpressionEvaluationError(
            sympy_evaluation.ParseDiagnostic(span.start), source, span, exc
        ) from None
    except (RecursionError, RuntimeError) as exc:
        raise sympy_evaluation.ExpressionEvaluationError(
            sympy_evaluation.ParseDiagnostic(-1), source, cause=exc
        ) from None
    finally:
        _ACTIVE_SOURCE.reset(source_token)


def _is_splittable(name: str) -> bool:
    if "_" in name:
        return False
    try:
        unicodedata.lookup(f"GREEK SMALL LETTER {name}")
    except KeyError:
        return len(name) > 1
    return False


def _implicit_operator(span: sympy_source.SourceSpan) -> _Operator:
    return _Operator("juxtapose", sympy_source.SourceSpan(span.start, span.start))


def _split_name(name: _Name) -> tuple[_Expression, ...]:
    parts: list[_Expression] = []
    digit_start: int | None = None
    for index, character in enumerate(name.text):
        if character.isdigit():
            if digit_start is None:
                digit_start = index
            continue
        if digit_start is not None:
            spans = name.character_spans[digit_start:index]
            parts.append(
                _Number(
                    name.text[digit_start:index],
                    _combine(spans[0], spans[-1]),
                )
            )
            digit_start = None
        parts.append(
            _Name(
                character, name.character_spans[index], (name.character_spans[index],)
            )
        )
    if digit_start is not None:
        spans = name.character_spans[digit_start:]
        parts.append(_Number(name.text[digit_start:], _combine(spans[0], spans[-1])))
    return tuple(parts)


def _make_implicit_product(items: Sequence[_Expression]) -> _Expression:
    operators = tuple(_implicit_operator(item.span) for item in items[1:])
    return _make_product(items, operators)


def _make_product(
    items: Sequence[_Expression], operators: Sequence[_Operator]
) -> _Expression:
    value = items[0]
    for operator, item in zip(operators, items[1:], strict=True):
        value = _Binary(
            value,
            operator,
            item,
            _combine(value.span, item.span),
        )
    return value


class _Lowerer:
    def __init__(
        self,
        source: sympy_source.MappedText,
        context: sympy_evaluation.EvaluationContext,
    ) -> None:
        self.source = source
        self.functions = context.functions
        self.variables = context.variables
        self.unsupported_global_names = context.unsupported_global_names
        self.unsupported_global_functions = context.unsupported_global_functions

    @staticmethod
    def _is_python_keyword(name: _Name) -> bool:
        # A single Greek character such as `λ` may normalize to a keyword.
        return keyword.iskeyword(name.text) and len(set(name.character_spans)) > 1

    def _expand_name(self, name: _Name) -> _Expression:
        if name.text in {"True", "False"}:
            return name
        if self._is_python_keyword(name):
            raise sympy_evaluation.ExpressionEvaluationError(
                sympy_evaluation.ParseDiagnostic(name.span.start),
                self.source,
                name.span,
            )
        if name.text in self.functions or name.text in self.variables:
            return name
        if _is_splittable(name.text):
            parts = _split_name(name)
            if all(
                isinstance(part, _Number)
                or (
                    isinstance(part, _Name)
                    and (part.text in self.functions or part.text in self.variables)
                )
                for part in parts
            ):
                return self._lower_implicit_segment(parts)
            if name.text not in self.unsupported_global_names:
                return self._lower_implicit_segment(parts)
        return name

    def _is_function_marker(self, value: _Expression) -> bool:
        if isinstance(value, _Name):
            return (
                value.text in self.functions
                or value.text in self.unsupported_global_functions
            )
        return (
            isinstance(value, _Binary)
            and value.operator.text == "**"
            and isinstance(value.left, _Name)
            and (
                value.left.text in self.functions
                or value.left.text in self.unsupported_global_functions
            )
        )

    def _apply_function_marker(
        self, marker: _Expression, argument: _Expression
    ) -> _Expression:
        if isinstance(marker, _Name):
            return _Call(marker, (argument,), _combine(marker.span, argument.span))
        assert isinstance(marker, _Binary)
        assert isinstance(marker.left, _Name)
        call = _Call(
            marker.left,
            (argument,),
            _combine(marker.left.span, argument.span),
        )
        return _Binary(
            call,
            marker.operator,
            marker.right,
            _combine(call.span, marker.right.span),
        )

    def _lower_implicit_segment(self, items: Sequence[_Expression]) -> _Expression:
        operators = tuple(_implicit_operator(item.span) for item in items[1:])
        return self._lower_multiplication_segment(items, operators)

    def _lower_multiplication_segment(
        self,
        items: Sequence[_Expression],
        operators: Sequence[_Operator],
    ) -> _Expression:
        for index, item in enumerate(items[:-1]):
            if self._is_function_marker(item) and operators[index].text == "juxtapose":
                argument = self._lower_multiplication_segment(
                    items[index + 1 :], operators[index + 1 :]
                )
                call = self._apply_function_marker(item, argument)
                return _make_product((*items[:index], call), operators[:index])
        return _make_product(items, operators)

    @staticmethod
    def _flatten_product(
        expression: _Expression,
    ) -> tuple[list[_Expression], list[_Operator]]:
        if not isinstance(expression, _Binary) or expression.operator.text not in {
            "juxtapose",
            "*",
            "/",
            "%",
        }:
            return [expression], []
        left_items, left_operators = _Lowerer._flatten_product(expression.left)
        return (
            [*left_items, expression.right],
            [*left_operators, expression.operator],
        )

    def _lower_product(self, expression: _Binary) -> _Expression:
        raw_items, operators = self._flatten_product(expression)
        items = [self.lower(item) for item in raw_items]
        segments: list[_Expression] = []
        explicit_operators: list[_Operator] = []
        current_items = [items[0]]
        current_operators: list[_Operator] = []
        for index, (operator, item) in enumerate(
            zip(operators, items[1:], strict=True)
        ):
            if (
                operator.text == "juxtapose"
                and isinstance(items[index], _Number)
                and isinstance(item, _Number)
            ):
                raise sympy_evaluation.ExpressionEvaluationError(
                    sympy_evaluation.ParseDiagnostic(item.span.start),
                    self.source,
                    item.span,
                )
            if operator.text == "juxtapose":
                current_items.append(item)
                current_operators.append(operator)
                continue
            segments.append(
                self._lower_multiplication_segment(current_items, current_operators)
            )
            explicit_operators.append(operator)
            current_items = [item]
            current_operators = []
        segments.append(
            self._lower_multiplication_segment(current_items, current_operators)
        )
        return _make_product(segments, explicit_operators)

    def lower(self, expression: _Expression) -> _Expression:
        if isinstance(expression, _Name):
            return self._expand_name(expression)
        if isinstance(expression, _Number):
            return expression
        if isinstance(expression, _Group):
            return _Group(self.lower(expression.value), expression.span)
        if isinstance(expression, _FiniteSet):
            return _FiniteSet(tuple(map(self.lower, expression.items)), expression.span)
        if isinstance(expression, _Interval):
            return _Interval(
                self.lower(expression.left),
                self.lower(expression.right),
                expression.left_bracket,
                expression.right_bracket,
                expression.span,
            )
        if isinstance(expression, _Delimited):
            return _Delimited(
                tuple(map(self.lower, expression.items)),
                expression.left_bracket,
                expression.right_bracket,
                expression.span,
            )
        if isinstance(expression, _Call):
            if self._is_python_keyword(expression.function):
                raise sympy_evaluation.ExpressionEvaluationError(
                    sympy_evaluation.ParseDiagnostic(expression.function.span.start),
                    self.source,
                    expression.function.span,
                )
            arguments = tuple(map(self.lower, expression.arguments))
            if (
                expression.function.text in self.functions
                or expression.function.text in sympy_constants.trig_functions
                or expression.function.text in self.unsupported_global_functions
            ):
                return _Call(expression.function, arguments, expression.span)
            if len(arguments) == 1:
                return self._lower_implicit_segment((
                    self._expand_name(expression.function),
                    _Group(arguments[0], expression.span),
                ))
            return _Call(expression.function, arguments, expression.span)
        if isinstance(expression, _Unary):
            return _Unary(
                expression.operator,
                self.lower(expression.operand),
                expression.span,
            )
        if isinstance(expression, _Factorial):
            return _Factorial(
                self.lower(expression.operand), expression.operator, expression.span
            )
        if isinstance(expression, _Binary):
            if expression.operator.text in {"juxtapose", "*", "/", "%"}:
                return self._lower_product(expression)
            if expression.operator.text == "**" and isinstance(expression.left, _Name):
                expanded = self._expand_name(expression.left)
                if isinstance(expanded, _Binary):
                    items, _operators = self._flatten_product(expanded)
                    right = self.lower(expression.right)
                    powered = _Binary(
                        items[-1],
                        expression.operator,
                        right,
                        _combine(items[-1].span, right.span),
                    )
                    return _make_implicit_product((*items[:-1], powered))
            return _Binary(
                self.lower(expression.left),
                expression.operator,
                self.lower(expression.right),
                expression.span,
            )
        raise AssertionError(expression)


_MATHJSON_FUNCTIONS = {
    "Abs": "abs",
    "Arccos": "arccos",
    "Arcosh": "acosh",
    "Arcsin": "arcsin",
    "Arctan": "arctan",
    "Arctan2": "arctan2",
    "Arsinh": "asinh",
    "Artanh": "atanh",
    "Cos": "cos",
    "Cosh": "cosh",
    "Cot": "cot",
    "Csc": "csc",
    "Exp": "exp",
    "Ln": "ln",
    "Log": "log",
    "Max": "max",
    "Min": "min",
    "Sec": "sec",
    "Sign": "sgn",
    "Sin": "sin",
    "Sinh": "sinh",
    "Sqrt": "sqrt",
    "Tan": "tan",
    "Tanh": "tanh",
}
_MATHJSON_SYMBOLS = {
    "ComplexNumbers": "Complexes",
    "ComplexInfinity": "zoo",
    "ExponentialE": "e",
    "ImaginaryUnit": "i",
    "Integers": "Integers",
    "NaN": "nan",
    "NonNegativeIntegers": "Naturals0",
    "Pi": "pi",
    "RationalNumbers": "Rationals",
    "RealNumbers": "Reals",
}
_MATHJSON_NUMBER = re.compile(
    r"^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$"
)


class _MathJsonDecoder:
    def __init__(self, source: sympy_source.MappedText) -> None:
        self.source = source

    def _span(self, value: object) -> sympy_source.SourceSpan:
        if isinstance(value, dict):
            offsets = value.get("sourceOffsets")
            if (
                isinstance(offsets, list | tuple)
                and len(offsets) == 2
                and all(isinstance(offset, int) for offset in offsets)
            ):
                start = min(max(offsets[0], 0), len(self.source.raw_text))
                end = min(max(offsets[1], start), len(self.source.raw_text))
                return sympy_source.SourceSpan(start, end)
        return sympy_source.SourceSpan(0, len(self.source.raw_text))

    def _raise(self, value: object) -> Never:
        span = self._span(value)
        raise sympy_evaluation.ExpressionEvaluationError(
            sympy_evaluation.ParseDiagnostic(span.start), self.source, span
        )

    def _name(self, text: str, span: sympy_source.SourceSpan) -> _Name:
        return _Name(text, span, len(text) * (span,))

    def _operator(self, text: str, span: sympy_source.SourceSpan) -> _Operator:
        return _Operator(text, span)

    def _decode_text(self, value: str, span: sympy_source.SourceSpan) -> _Expression:
        if value == "EmptySet":
            return _FiniteSet((), span)
        if value in {"PositiveInfinity", "+Infinity", "Infinity"}:
            return self._name("infty", span)
        if value in {"NegativeInfinity", "-Infinity"}:
            return _Unary(self._operator("-", span), self._name("infty", span), span)
        if value in _MATHJSON_SYMBOLS:
            value = _MATHJSON_SYMBOLS[value]
        if _MATHJSON_NUMBER.fullmatch(value):
            return _Number(value, span)
        if value.startswith(("'", '"')):
            self._raise(value)
        return self._name(value, span)

    def _chain(
        self, operator: str, values: list[object], span: sympy_source.SourceSpan
    ) -> _Expression:
        if not values:
            self._raise(values)
        result = self.decode(values[0])
        for value in values[1:]:
            result = _Binary(
                result,
                self._operator(operator, span),
                self.decode(value),
                span,
            )
        return result

    def _interval_endpoint(self, value: object) -> tuple[_Expression, bool]:
        if isinstance(value, list) and value and value[0] == "Open":
            if len(value) != 2:
                self._raise(value)
            return self.decode(value[1]), True
        return self.decode(value), False

    @staticmethod
    def _delimiter(value: object) -> tuple[str, str] | None:
        if isinstance(value, dict):
            value = value.get("str")
        if not isinstance(value, str):
            return None
        marker = value.strip("'\"").replace(" ", "")
        if marker == "(,)":
            return "(", ")"
        if marker == "[,]":
            return "[", "]"
        return None

    def _sequence(self, value: object) -> list[object] | None:
        if isinstance(value, list) and value and value[0] == "Sequence":
            return value[1:]
        if isinstance(value, dict) and isinstance(value.get("fn"), list):
            return self._sequence(value["fn"])
        return None

    def _decode_function(
        self, value: list[object], span: sympy_source.SourceSpan
    ) -> _Expression:
        if not value or not isinstance(value[0], str):
            self._raise(value)
        head = value[0]
        arguments = value[1:]
        if head == "Error" or head in {"ErrorCode", "Nothing"}:
            self._raise(value)
        if head == "Add":
            return self._chain("+", arguments, span)
        if head == "Subtract":
            if len(arguments) == 1:
                return _Unary(
                    self._operator("-", span), self.decode(arguments[0]), span
                )
            return self._chain("-", arguments, span)
        if head == "Negate":
            if len(arguments) != 1:
                self._raise(value)
            return _Unary(self._operator("-", span), self.decode(arguments[0]), span)
        if head in {"Multiply", "InvisibleOperator"}:
            return self._chain("*", arguments, span)
        if head == "Divide":
            if len(arguments) < 2:
                self._raise(value)
            return self._chain("/", arguments, span)
        if head == "Power":
            if len(arguments) != 2:
                self._raise(value)
            return _Binary(
                self.decode(arguments[0]),
                self._operator("**", span),
                self.decode(arguments[1]),
                span,
            )
        if head == "Rational":
            if len(arguments) != 2:
                self._raise(value)
            return _Binary(
                self.decode(arguments[0]),
                self._operator("/", span),
                self.decode(arguments[1]),
                span,
            )
        if head == "Factorial":
            if len(arguments) != 1:
                self._raise(value)
            return _Factorial(
                self.decode(arguments[0]), self._operator("!", span), span
            )
        if head == "Set":
            if (
                len(arguments) == 2
                and isinstance(arguments[1], list)
                and len(arguments[1]) == 2
                and arguments[1][0] == "Condition"
            ):
                return _SetBuilder(
                    self.decode(arguments[0]),
                    self.decode(arguments[1][1]),
                    span,
                )
            if any(
                isinstance(argument, list) and argument and argument[0] == "Condition"
                for argument in arguments
            ):
                self._raise(value)
            return _FiniteSet(tuple(map(self.decode, arguments)), span)
        if head == "Union":
            return self._chain("cup", arguments, span)
        if head == "Intersection":
            return self._chain("cap", arguments, span)
        if head == "SetMinus":
            if len(arguments) != 2:
                self._raise(value)
            return self._chain("-", arguments, span)
        if head == "Interval":
            if len(arguments) != 2:
                self._raise(value)
            left, left_open = self._interval_endpoint(arguments[0])
            right, right_open = self._interval_endpoint(arguments[1])
            return _Interval(
                left,
                right,
                self._operator("(" if left_open else "[", span),
                self._operator(")" if right_open else "]", span),
                span,
            )
        if head == "List":
            return _Delimited(
                tuple(map(self.decode, arguments)),
                self._operator("[", span),
                self._operator("]", span),
                span,
            )
        if head == "Tuple":
            return _Delimited(
                tuple(map(self.decode, arguments)),
                self._operator("(", span),
                self._operator(")", span),
                span,
            )
        if head == "Delimiter":
            if len(arguments) == 1:
                return _Group(self.decode(arguments[0]), span)
            sequence = self._sequence(arguments[0])
            delimiter = self._delimiter(arguments[1]) if len(arguments) == 2 else None
            if sequence is None or delimiter is None:
                self._raise(value)
            left, right = delimiter
            return _Delimited(
                tuple(map(self.decode, sequence)),
                self._operator(left, span),
                self._operator(right, span),
                span,
            )
        if head == "Apply":
            if not arguments:
                self._raise(value)
            function_value, *arguments = arguments
            if isinstance(function_value, dict):
                function_value = function_value.get("sym")
            if not isinstance(function_value, str):
                self._raise(value)
            function = self._name(function_value, span)
            return _Call(function, tuple(map(self.decode, arguments)), span)

        function_name = _MATHJSON_FUNCTIONS.get(head, head)
        function = self._name(function_name, span)
        return _Call(function, tuple(map(self.decode, arguments)), span)

    def decode(self, value: object) -> _Expression:
        span = self._span(value)
        if value is True:
            return self._name("True", span)
        if value is False:
            return self._name("False", span)
        if isinstance(value, int):
            return _Number(str(value), span)
        if isinstance(value, float):
            if not math.isfinite(value):
                self._raise(value)
            return _Number(str(value), span)
        if isinstance(value, str):
            return self._decode_text(value, span)
        if isinstance(value, dict):
            if isinstance(value.get("fn"), list):
                return self._decode_function(value["fn"], span)
            if isinstance(value.get("sym"), str):
                return self._decode_text(value["sym"], span)
            if isinstance(value.get("num"), str):
                return self._decode_text(value["num"], span)
            self._raise(value)
        if isinstance(value, list):
            return self._decode_function(value, span)
        self._raise(value)


def _decode_mathjson(
    value: mathjson.MathJsonExpression, source: sympy_source.MappedText
) -> _Expression:
    return _MathJsonDecoder(source).decode(value)


@dataclass(frozen=True, slots=True)
class _Evaluated:
    value: sympy.Basic | bool
    type: sympy_evaluation.SympyType | None


class Evaluator:
    def __init__(
        self,
        source: sympy_source.MappedText,
        context: sympy_evaluation.EvaluationContext,
    ) -> None:
        self.source = source
        self.functions = context.functions
        self.variables = context.variables
        self.unsupported_global_names = context.unsupported_global_names
        self.unsupported_global_functions = context.unsupported_global_functions
        self.allow_sets = context.allow_sets
        self.simplify_expression = context.simplify_expression
        self.simplify_set_operations = context.simplify_set_operations
        self.delimited_syntax = context.delimited_syntax
        self.allow_extra_symbols = context.allow_extra_symbols
        self.legacy_untyped_names = context.legacy_untyped_names
        self.legacy_untyped_functions = context.legacy_untyped_functions
        self.unknown_names: list[_Name] = []

    def _raise(
        self,
        diagnostic: sympy_evaluation.EvaluationDiagnostic,
        span: sympy_source.SourceSpan,
    ) -> Never:
        raise sympy_evaluation.ExpressionEvaluationError(diagnostic, self.source, span)

    def _require_signature(
        self,
        name: str,
        arguments: Sequence[_Evaluated],
        span: sympy_source.SourceSpan,
        signatures: Sequence[Sequence[sympy_evaluation.SympyType | None]],
    ) -> None:
        arity_matches = [
            signature for signature in signatures if len(signature) == len(arguments)
        ]
        if not arity_matches:
            expected = sympy_evaluation.format_comma_separated(
                sorted({len(signature) for signature in signatures})
            )
            self._raise(
                sympy_evaluation.FunctionArityDiagnostic(
                    name, len(arguments), expected
                ),
                span,
            )

        failures: list[
            tuple[int, sympy_evaluation.SympyType, sympy_evaluation.SympyType]
        ] = []
        for signature in arity_matches:
            for index, (expected, argument) in enumerate(
                zip(signature, arguments, strict=True)
            ):
                if (
                    expected is not None
                    and argument.type is not None
                    and argument.type != expected
                ):
                    failures.append((index, expected, argument.type))
                    break
            else:
                return
        index, _, got = max(failures, key=lambda failure: failure[0])
        expected_types = tuple(expected for i, expected, _ in failures if i == index)
        self._raise(
            sympy_evaluation.ArgumentTypeDiagnostic(name, got, expected_types, index),
            span,
        )

    def _set_call_type(
        self,
        name: str,
        arguments: Sequence[_Evaluated],
        span: sympy_source.SourceSpan,
    ) -> None:
        scalar = sympy_evaluation.SympyType.SCALAR
        set_type = sympy_evaluation.SympyType.SET
        bool_type = sympy_evaluation.SympyType.BOOL
        match name:
            case "FiniteSet":
                return
            case "Interval":
                self._require_signature(
                    name,
                    arguments,
                    span,
                    ((scalar, scalar), (scalar, scalar, bool_type, bool_type)),
                )
            case "Union" | "Intersection":
                if not arguments:
                    self._raise(
                        sympy_evaluation.FunctionArityDiagnostic(name, 0, "1+"),
                        span,
                    )
                self._require_signature(
                    name, arguments, span, (len(arguments) * (set_type,),)
                )
            case "Complement":
                self._require_signature(name, arguments, span, ((set_type, set_type),))
            case _:
                raise AssertionError(name)

    def _call(
        self,
        name: str,
        function: Callable[..., object],
        arguments: Sequence[_Evaluated],
        span: sympy_source.SourceSpan,
    ) -> _Evaluated:
        if self.allow_sets and function is sympy_constants.set_functions.get(name):
            self._set_call_type(name, arguments, span)
            result_type: sympy_evaluation.SympyType | None = (
                sympy_evaluation.SympyType.SET
            )
        else:
            arities = sympy_evaluation.builtin_function_arities(name)
            if arities is not None:
                self._require_signature(
                    name,
                    arguments,
                    span,
                    tuple(
                        arity * (sympy_evaluation.SympyType.SCALAR,)
                        for arity in arities
                    ),
                )
            elif (
                name in sympy_constants.functions
                or name in sympy_constants.trig_functions
            ):
                arities = sympy_evaluation.builtin_function_arities(name) or (
                    len(arguments),
                )
                self._require_signature(
                    name,
                    arguments,
                    span,
                    tuple(
                        arity * (sympy_evaluation.SympyType.SCALAR,)
                        for arity in arities
                    ),
                )
            result_type = (
                None
                if name in self.legacy_untyped_functions
                else sympy_evaluation.SympyType.SCALAR
            )

        values = [argument.value for argument in arguments]
        kwargs: dict[str, bool] = {}
        if (
            not self.simplify_expression
            and name in sympy_constants.evaluate_false_functions
        ):
            kwargs["evaluate"] = False
        if not self.simplify_set_operations and name in sympy_constants.set_functions:
            kwargs["evaluate"] = False
        try:
            value = function(*values, **kwargs)
        except (TypeError, AttributeError) as exc:
            raise sympy_evaluation.ExpressionEvaluationError(
                sympy_evaluation.EvaluationFailureDiagnostic(),
                self.source,
                span,
                exc,
            ) from None
        if isinstance(value, (bool, Boolean)):
            result_type = sympy_evaluation.SympyType.BOOL
        elif isinstance(value, sympy.Set):
            result_type = sympy_evaluation.SympyType.SET
        elif isinstance(value, sympy.Tuple):
            result_type = sympy_evaluation.SympyType.TUPLE
        return _Evaluated(cast(sympy_evaluation.SympyValue, value), result_type)

    def _unconfigured_names(self, expression: _Expression) -> list[_Name]:
        names: list[_Name] = []

        def visit(value: _Expression) -> None:
            if isinstance(value, _Name):
                if (
                    value.text not in {"True", "False"}
                    and value.text not in self.variables
                    and value.text not in self.functions
                ):
                    names.append(value)
                return
            if isinstance(value, (_Number, _SetBuilder)):
                return
            if isinstance(value, _Call):
                for argument in value.arguments:
                    visit(argument)
                return
            if isinstance(value, _Unary):
                visit(value.operand)
                return
            if isinstance(value, _Binary):
                visit(value.left)
                visit(value.right)
                return
            if isinstance(value, _Factorial):
                visit(value.operand)
                return
            if isinstance(value, _FiniteSet):
                for item in value.items:
                    visit(item)
                return
            if isinstance(value, _Interval):
                visit(value.left)
                visit(value.right)
                return
            if isinstance(value, _Delimited):
                for item in value.items:
                    visit(item)
                return
            if isinstance(value, _Group):
                visit(value.value)
                return
            raise AssertionError(value)

        visit(expression)
        return names

    @staticmethod
    def _flatten_and(expression: _Expression) -> list[_Expression]:
        if isinstance(expression, _Group):
            return Evaluator._flatten_and(expression.value)
        if isinstance(expression, _Call) and expression.function.text == "And":
            return [
                clause
                for argument in expression.arguments
                for clause in Evaluator._flatten_and(argument)
            ]
        return [expression]

    def _evaluate_set_builder(self, expression: _SetBuilder) -> _Evaluated:
        if not self.allow_sets:
            self._raise(sympy_evaluation.SetNotationDiagnostic(), expression.span)

        candidate_names = [
            *self._unconfigured_names(expression.body),
            *self._unconfigured_names(expression.condition),
        ]
        bound_names = tuple(dict.fromkeys(name.text for name in candidate_names))
        if not bound_names:
            self._raise(
                sympy_evaluation.SetExpressionDiagnostic(
                    "Set-builder notation must bind at least one variable."
                ),
                expression.span,
            )

        bound_symbols = {name: sympy.Symbol(name) for name in bound_names}
        previous_variables = self.variables
        merged_variables = self.variables.copy()
        merged_variables.update(bound_symbols)
        self.variables = merged_variables
        try:
            domain_expressions: dict[str, list[_Expression]] = {
                name: [] for name in bound_names
            }
            remaining_conditions: list[_Expression] = []
            for clause in self._flatten_and(expression.condition):
                if (
                    isinstance(clause, _Call)
                    and clause.function.text == "Element"
                    and len(clause.arguments) == 2
                    and isinstance(clause.arguments[0], _Name)
                    and clause.arguments[0].text in domain_expressions
                ):
                    domain_expressions[clause.arguments[0].text].append(
                        clause.arguments[1]
                    )
                else:
                    remaining_conditions.append(clause)

            domains: list[sympy.Set] = []
            for name in bound_names:
                evaluated_domains = [
                    self.evaluate(domain_expression)
                    for domain_expression in domain_expressions[name]
                ]
                if any(
                    domain.type != sympy_evaluation.SympyType.SET
                    for domain in evaluated_domains
                ):
                    self._raise(
                        sympy_evaluation.SetExpressionDiagnostic(
                            "Set-builder domains must be sets."
                        ),
                        expression.span,
                    )
                if not evaluated_domains:
                    domains.append(sympy.S.Reals)
                elif len(evaluated_domains) == 1:
                    domains.append(cast(sympy.Set, evaluated_domains[0].value))
                else:
                    domains.append(
                        sympy.Intersection(
                            *(
                                cast(sympy.Set, domain.value)
                                for domain in evaluated_domains
                            ),
                            evaluate=self.simplify_set_operations,
                        )
                    )

            body = self.evaluate(expression.body)
            if body.type not in {
                sympy_evaluation.SympyType.SCALAR,
                sympy_evaluation.SympyType.TUPLE,
            }:
                self._raise(
                    sympy_evaluation.SetExpressionDiagnostic(
                        "Set-builder values must be scalar or tuple expressions."
                    ),
                    expression.body.span,
                )

            if not remaining_conditions:
                condition_value: Boolean | bool = True
            else:
                remaining = remaining_conditions[0]
                if len(remaining_conditions) > 1:
                    remaining = _Call(
                        _Name(
                            "And",
                            expression.condition.span,
                            (expression.condition.span,),
                        ),
                        tuple(remaining_conditions),
                        expression.condition.span,
                    )
                condition = self.evaluate(remaining)
                if condition.type != sympy_evaluation.SympyType.BOOL:
                    self._raise(
                        sympy_evaluation.SetExpressionDiagnostic(
                            "Set-builder conditions must be true/false expressions."
                        ),
                        expression.condition.span,
                    )
                condition_value = cast(Boolean | bool, condition.value)

            value = SetBuilderSet(
                cast(sympy.Basic, body.value),
                tuple(bound_symbols[name] for name in bound_names),
                sympy.sympify(condition_value),
                domains,
            )
            return _Evaluated(value, sympy_evaluation.SympyType.SET)
        finally:
            self.variables = previous_variables

    def _binary(self, expression: _Binary) -> _Evaluated:
        left = self.evaluate(expression.left)
        right = self.evaluate(expression.right)
        operator = expression.operator.text
        scalar = sympy_evaluation.SympyType.SCALAR
        set_type = sympy_evaluation.SympyType.SET

        if operator in {"cup", "U", "∪", "|", "cap", "∩", "&"}:  # ruff: ignore[ambiguous-unicode-character-string]
            signatures = ((set_type, set_type),)
            result_type = left.type or right.type
        elif operator in {"+", "-"}:
            signatures = ((set_type, set_type), (scalar, scalar))
            result_type = left.type or right.type
        else:
            signatures = ((scalar, scalar),)
            result_type = scalar
        self._require_signature(
            operator,
            (left, right),
            expression.operator.span,
            signatures,
        )

        is_set_operation = result_type == set_type
        try:
            if is_set_operation:
                left_set = cast(sympy.Set, left.value)
                right_set = cast(sympy.Set, right.value)
                if operator in {"cup", "U", "∪", "|", "+"}:  # ruff: ignore[ambiguous-unicode-character-string]
                    value = sympy.Union(
                        left_set,
                        right_set,
                        evaluate=self.simplify_set_operations,
                    )
                elif operator in {"cap", "∩", "&"}:
                    value = sympy.Intersection(
                        left_set,
                        right_set,
                        evaluate=self.simplify_set_operations,
                    )
                else:
                    value = sympy.Complement(
                        left_set,
                        right_set,
                        evaluate=self.simplify_set_operations,
                    )
            else:
                left_value = cast(sympy.Basic, left.value)
                right_value = cast(sympy.Basic, right.value)
                value = self._scalar_binary(
                    operator,
                    left_value,
                    right_value,
                )
        except (TypeError, AttributeError) as exc:
            raise sympy_evaluation.ExpressionEvaluationError(
                sympy_evaluation.EvaluationFailureDiagnostic(),
                self.source,
                expression.operator.span,
                exc,
            ) from None
        return _Evaluated(cast(sympy_evaluation.SympyValue, value), result_type)

    def _scalar_binary(
        self,
        operator: str,
        left_value: sympy.Basic,
        right_value: sympy.Basic,
    ) -> sympy.Basic:
        if operator in {"cup", "U", "∪", "|"}:  # ruff: ignore[ambiguous-unicode-character-string]
            return sympy.Or(cast(Boolean, left_value), cast(Boolean, right_value))
        if operator in {"cap", "∩", "&"}:
            return sympy.And(cast(Boolean, left_value), cast(Boolean, right_value))

        left_expr = cast(sympy.Expr, left_value)
        right_expr = cast(sympy.Expr, right_value)
        if self.simplify_expression:
            return {
                "+": lambda: left_expr + right_expr,
                "-": lambda: left_expr - right_expr,
                "*": lambda: left_expr * right_expr,
                "juxtapose": lambda: left_expr * right_expr,
                "/": lambda: left_expr / right_expr,
                "%": lambda: left_expr % right_expr,
                "**": lambda: left_expr**right_expr,
            }[operator]()

        def flatten(
            value: sympy.Expr, operation: type[sympy.Add | sympy.Mul]
        ) -> tuple[sympy.Expr, ...]:
            return value.args if isinstance(value, operation) else (value,)

        if operator == "+":
            return sympy.Add(
                *flatten(left_expr, sympy.Add),
                *flatten(right_expr, sympy.Add),
                evaluate=False,
            )
        if operator == "-":
            negative = sympy.Mul(-1, right_expr, evaluate=False)
            return sympy.Add(
                *flatten(left_expr, sympy.Add),
                *flatten(negative, sympy.Add),
                evaluate=False,
            )
        if operator in {"*", "juxtapose"}:
            return sympy.Mul(
                *flatten(left_expr, sympy.Mul),
                *flatten(right_expr, sympy.Mul),
                evaluate=False,
            )
        if operator == "/":
            reciprocal = sympy.Pow(right_expr, -1, evaluate=False)
            return sympy.Mul(
                *flatten(left_expr, sympy.Mul),
                *flatten(reciprocal, sympy.Mul),
                evaluate=False,
            )
        if operator == "%":
            return sympy.Mod(left_expr, right_expr, evaluate=False)
        return sympy.Pow(left_expr, right_expr, evaluate=False)

    def evaluate(self, expression: _Expression) -> _Evaluated:
        if isinstance(expression, _Number):
            number_value: sympy.Expr
            if "." in expression.text or "e" in expression.text.lower():
                number_value = sympy.Float(expression.text)
                self._raise(
                    sympy_evaluation.FloatDiagnostic(float(number_value)),
                    expression.span,
                )
            else:
                number_value = sympy.Integer(expression.text)
            return _Evaluated(number_value, sympy_evaluation.SympyType.SCALAR)
        if isinstance(expression, _Name):
            if expression.text == "True":
                return _Evaluated(value=True, type=sympy_evaluation.SympyType.BOOL)
            if expression.text == "False":
                return _Evaluated(value=False, type=sympy_evaluation.SympyType.BOOL)
            if expression.text in self.functions:
                self._raise(
                    sympy_evaluation.FunctionWithoutArgumentsDiagnostic(
                        expression.span.start, expression.text
                    ),
                    expression.span,
                )
            resolved_value = self.variables.get(expression.text)
            if resolved_value is None:
                if expression.text in self.unsupported_global_names:
                    if expression.text in self.unsupported_global_functions:
                        diagnostic: sympy_evaluation.EvaluationDiagnostic = (
                            sympy_evaluation.FunctionWithoutArgumentsDiagnostic(
                                expression.span.start, expression.text
                            )
                        )
                    else:
                        diagnostic = sympy_evaluation.InvalidSymbolDiagnostic(
                            expression.text, expression.span.start
                        )
                    self._raise(diagnostic, expression.span)
                if not self.allow_extra_symbols:
                    self.unknown_names.append(expression)
                resolved_value = sympy.Symbol(expression.text)
            name_value = sympy.sympify(resolved_value)
            if isinstance(name_value, sympy.Set) and not self.allow_sets:
                self._raise(sympy_evaluation.SetNotationDiagnostic(), expression.span)
            if expression.text in self.legacy_untyped_names:
                value_type = None
            elif isinstance(name_value, sympy.Set):
                value_type = sympy_evaluation.SympyType.SET
            elif name_value is sympy.true or name_value is sympy.false:
                value_type = sympy_evaluation.SympyType.BOOL
            else:
                value_type = sympy_evaluation.SympyType.SCALAR
            return _Evaluated(cast(sympy_evaluation.SympyValue, name_value), value_type)
        if isinstance(expression, _Group):
            return self.evaluate(expression.value)
        if isinstance(expression, _Unary):
            operand = self.evaluate(expression.operand)
            if operand.type == sympy_evaluation.SympyType.SET:
                self._raise(
                    sympy_evaluation.InvalidExpressionDiagnostic(
                        expression.operator.span.start
                    ),
                    expression.operator.span,
                )
            if expression.operator.text == "+":
                return operand
            if expression.operator.text == "-":
                value = cast(sympy.Expr, operand.value)
                return _Evaluated(-value, operand.type)
            if isinstance(operand.value, bool):
                inverted_value = sympy.Integer(-int(operand.value) - 1)
            elif operand.value is sympy.true:
                inverted_value = sympy.false
            elif operand.value is sympy.false:
                inverted_value = sympy.true
            else:
                value = cast(_SupportsInvert, operand.value)
                inverted_value = sympy.sympify(~value)
            return _Evaluated(
                cast(sympy_evaluation.SympyValue, inverted_value), operand.type
            )
        if isinstance(expression, _Binary):
            return self._binary(expression)
        if isinstance(expression, _Factorial):
            operand = self.evaluate(expression.operand)
            self._require_signature(
                "factorial",
                (operand,),
                expression.operator.span,
                ((sympy_evaluation.SympyType.SCALAR,),),
            )
            return self._call(
                "factorial",
                self.functions["factorial"],
                (operand,),
                expression.operator.span,
            )
        if isinstance(expression, _Call):
            function = self.functions.get(expression.function.text)
            if function is None:
                if (
                    expression.function.text in sympy_constants.trig_functions
                    or expression.function.text in sympy_constants.sympy_global_names
                ):
                    diagnostic: sympy_evaluation.EvaluationDiagnostic = (
                        sympy_evaluation.InvalidFunctionDiagnostic(
                            expression.function.span.start,
                            expression.function.text,
                        )
                    )
                else:
                    diagnostic = sympy_evaluation.InvalidExpressionDiagnostic(
                        expression.function.span.start
                    )
                self._raise(diagnostic, expression.function.span)
            arguments = tuple(map(self.evaluate, expression.arguments))
            return self._call(
                expression.function.text,
                function,
                arguments,
                expression.function.span,
            )
        if isinstance(expression, _SetBuilder):
            return self._evaluate_set_builder(expression)
        if isinstance(expression, _FiniteSet):
            if not self.allow_sets:
                self._raise(sympy_evaluation.SetNotationDiagnostic(), expression.span)
            items = tuple(map(self.evaluate, expression.items))
            return _Evaluated(
                sympy.FiniteSet(
                    *(cast(sympy.Basic, item.value) for item in items),
                    evaluate=self.simplify_set_operations,
                ),
                sympy_evaluation.SympyType.SET,
            )
        if isinstance(expression, _Interval):
            if not self.allow_sets:
                self._raise(sympy_evaluation.SetNotationDiagnostic(), expression.span)
            left = self.evaluate(expression.left)
            right = self.evaluate(expression.right)
            if sympy_evaluation.SympyType.SET in (left.type, right.type):
                bad_span = (
                    expression.left.span
                    if left.type == sympy_evaluation.SympyType.SET
                    else expression.right.span
                )
                self._raise(sympy_evaluation.ParseDiagnostic(bad_span.start), bad_span)
            self._require_signature(
                "Interval",
                (left, right),
                expression.left_bracket.span,
                (
                    (
                        sympy_evaluation.SympyType.SCALAR,
                        sympy_evaluation.SympyType.SCALAR,
                    ),
                ),
            )
            interval_value = sympy.Interval(
                cast(sympy.Expr, left.value),
                cast(sympy.Expr, right.value),
                left_open=expression.left_bracket.text == "(",
                right_open=expression.right_bracket.text == ")",
            )
            return _Evaluated(interval_value, sympy_evaluation.SympyType.SET)
        if isinstance(expression, _Delimited):
            if not self.allow_sets:
                self._raise(sympy_evaluation.SetNotationDiagnostic(), expression.span)
            items = tuple(map(self.evaluate, expression.items))
            self._require_signature(
                "Tuple" if self.delimited_syntax == "tuple" else "Interval",
                items,
                expression.left_bracket.span,
                (len(items) * (sympy_evaluation.SympyType.SCALAR,),),
            )
            if self.delimited_syntax == "tuple":
                if (
                    expression.left_bracket.text != "("
                    or expression.right_bracket.text != ")"
                ):
                    self._raise(
                        sympy_evaluation.SetExpressionDiagnostic(
                            "Interval notation is not allowed when tuple syntax is enabled."
                        ),
                        expression.span,
                    )
                return _Evaluated(
                    sympy.Tuple(*(cast(sympy.Expr, item.value) for item in items)),
                    sympy_evaluation.SympyType.TUPLE,
                )
            if len(items) != 2:
                self._raise(
                    sympy_evaluation.SetExpressionDiagnostic(
                        "Intervals must contain exactly two endpoints."
                    ),
                    expression.span,
                )
            return _Evaluated(
                sympy.Interval(
                    cast(sympy.Expr, items[0].value),
                    cast(sympy.Expr, items[1].value),
                    left_open=expression.left_bracket.text == "(",
                    right_open=expression.right_bracket.text == ")",
                ),
                sympy_evaluation.SympyType.SET,
            )
        raise AssertionError(expression)


def _parse_and_evaluate(
    source: sympy_source.MappedText,
    context: sympy_evaluation.EvaluationContext,
    start: ParserStart = "symbolic_start",
) -> tuple[sympy_evaluation.SympyValue, _Expression]:
    try:
        parsed = _parse(source, start)
        lowerer = _Lowerer(source, context)
        lowered = lowerer.lower(parsed)
    except sympy_evaluation.ExpressionEvaluationError:
        raise
    except RecursionError as exc:
        raise sympy_evaluation.ExpressionEvaluationError(
            sympy_evaluation.ParseDiagnostic(-1), source, cause=exc
        ) from None
    except (TypeError, AttributeError) as exc:
        raise sympy_evaluation.ExpressionEvaluationError(
            sympy_evaluation.EvaluationFailureDiagnostic(), source, cause=exc
        ) from None
    return _evaluate_lowered(source, context, lowered), lowered


def _evaluate_lowered(
    source: sympy_source.MappedText,
    context: sympy_evaluation.EvaluationContext,
    lowered: _Expression,
) -> sympy_evaluation.SympyValue:
    try:
        evaluator = Evaluator(source, context)
        result = cast(sympy_evaluation.SympyValue, evaluator.evaluate(lowered).value)
    except sympy_evaluation.ExpressionEvaluationError:
        raise
    except RecursionError as exc:
        raise sympy_evaluation.ExpressionEvaluationError(
            sympy_evaluation.ParseDiagnostic(-1), source, cause=exc
        ) from None
    except (TypeError, AttributeError) as exc:
        raise sympy_evaluation.ExpressionEvaluationError(
            sympy_evaluation.EvaluationFailureDiagnostic(), source, cause=exc
        ) from None
    if not context.allow_extra_symbols and evaluator.unknown_names:
        invalid_name = max(
            {name.text for name in evaluator.unknown_names},
            key=lambda name: sympy.default_sort_key(sympy.Symbol(name)),
        )
        raise sympy_evaluation.ExpressionEvaluationError(
            sympy_evaluation.InvalidSymbolDiagnostic(invalid_name),
            source,
        )
    return result


def parse_and_evaluate(
    source: sympy_source.MappedText,
    context: sympy_evaluation.EvaluationContext,
    start: ParserStart = "symbolic_start",
) -> sympy_evaluation.SympyValue:
    """Parse normalized source and evaluate it without generated Python."""
    result, _lowered = _parse_and_evaluate(source, context, start)
    return result


def parse_and_evaluate_with_structure(
    source: sympy_source.MappedText,
    context: sympy_evaluation.EvaluationContext,
    start: ParserStart = "symbolic_start",
) -> tuple[sympy_evaluation.SympyValue, str]:
    """Parse and evaluate normalized source, returning its lowered structure."""
    result, lowered = _parse_and_evaluate(source, context, start)
    return result, lowered.to_structure()


def evaluate_mathjson_with_structure(
    value: mathjson.MathJsonExpression,
    source: sympy_source.MappedText,
    context: sympy_evaluation.EvaluationContext,
) -> tuple[sympy_evaluation.SympyValue, str]:
    """Decode MathJSON to lowered IR and evaluate it without invoking Lark."""
    try:
        lowered = _decode_mathjson(value, source)
    except sympy_evaluation.ExpressionEvaluationError:
        raise
    except RecursionError as exc:
        raise sympy_evaluation.ExpressionEvaluationError(
            sympy_evaluation.ParseDiagnostic(-1), source, cause=exc
        ) from None
    result = _evaluate_lowered(source, context, lowered)
    return result, lowered.to_structure()
