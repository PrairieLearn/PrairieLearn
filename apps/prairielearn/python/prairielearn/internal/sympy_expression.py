"""Private grammar parser and direct evaluator for symbolic expressions."""

from __future__ import annotations

import keyword
import unicodedata
from contextvars import ContextVar
from dataclasses import dataclass
from importlib.resources import files
from typing import TYPE_CHECKING, Never, Protocol, cast

import sympy
from lark import Lark, Token, Transformer
from lark.exceptions import UnexpectedInput, UnexpectedToken

from prairielearn.internal import sympy_constants, sympy_evaluation, sympy_source

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

_GRAMMAR = (
    files("prairielearn.internal")
    .joinpath("sympy_expression.lark")
    .read_text(encoding="utf-8")
)


@dataclass(frozen=True, slots=True)
class _Operator:
    text: str
    span: sympy_source.SourceSpan


@dataclass(frozen=True, slots=True)
class _Number:
    text: str
    span: sympy_source.SourceSpan

    def to_source(self) -> str:
        return self.text


@dataclass(frozen=True, slots=True)
class _Name:
    text: str
    span: sympy_source.SourceSpan
    character_spans: tuple[sympy_source.SourceSpan, ...]

    def to_source(self) -> str:
        return self.text


@dataclass(frozen=True, slots=True)
class _Call:
    function: _Name
    arguments: tuple[_Expression, ...]
    span: sympy_source.SourceSpan

    def to_source(self) -> str:
        arguments = ",".join(argument.to_source() for argument in self.arguments)
        return f"{self.function.text}({arguments})"


@dataclass(frozen=True, slots=True)
class _Unary:
    operator: _Operator
    operand: _Expression
    span: sympy_source.SourceSpan

    def to_source(self) -> str:
        return f"({self.operator.text}{self.operand.to_source()})"


@dataclass(frozen=True, slots=True)
class _Binary:
    left: _Expression
    operator: _Operator
    right: _Expression
    span: sympy_source.SourceSpan

    def to_source(self) -> str:
        operator = {
            "juxtapose": "*",
            "cup": "|",
            "U": "|",
            "∪": "|",  # ruff: ignore[ambiguous-unicode-character-string]
            "cap": "&",
            "∩": "&",
        }.get(self.operator.text, self.operator.text)
        return f"({self.left.to_source()}{operator}{self.right.to_source()})"


@dataclass(frozen=True, slots=True)
class _Factorial:
    operand: _Expression
    operator: _Operator
    span: sympy_source.SourceSpan

    def to_source(self) -> str:
        return f"factorial({self.operand.to_source()})"


@dataclass(frozen=True, slots=True)
class _FiniteSet:
    items: tuple[_Expression, ...]
    span: sympy_source.SourceSpan

    def to_source(self) -> str:
        items = ",".join(item.to_source() for item in self.items)
        return f"FiniteSet({items})"


@dataclass(frozen=True, slots=True)
class _Interval:
    left: _Expression
    right: _Expression
    left_bracket: _Operator
    right_bracket: _Operator
    span: sympy_source.SourceSpan

    def to_source(self) -> str:
        left_open = self.left_bracket.text == "("
        right_open = self.right_bracket.text == ")"
        return (
            f"Interval({self.left.to_source()},{self.right.to_source()},"
            f"{left_open},{right_open})"
        )


@dataclass(frozen=True, slots=True)
class _Group:
    value: _Expression
    span: sympy_source.SourceSpan

    def to_source(self) -> str:
        return f"group({self.value.to_source()})"


type _Expression = (
    _Number
    | _Name
    | _Call
    | _Unary
    | _Binary
    | _Factorial
    | _FiniteSet
    | _Interval
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


_ACTIVE_SOURCE: ContextVar[sympy_source.SourceText] = ContextVar(
    "sympy_expression_source"
)


def _source_span(start: int, end: int) -> sympy_source.SourceSpan:
    source = _ACTIVE_SOURCE.get()
    if start == end:
        offset = (
            source.tokens[start].raw_offset
            if start < len(source.tokens)
            else len(source.raw_text)
        )
        return sympy_source.SourceSpan(offset, offset)
    tokens = source.tokens[start:end]
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

    @staticmethod
    def _operator_token(token: Token) -> _Operator:
        return _Operator(str(token), _source_span(*_token_bounds(token)))

    UNION = _operator_token
    INTERSECTION = _operator_token
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

    def start(self, items: list[_TransformValue]) -> _Expression:
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


_PARSER = Lark(
    _GRAMMAR,
    parser="lalr",
    lexer="contextual",
    transformer=_IRTransformer(),
    maybe_placeholders=False,
)


def _parse(source: sympy_source.SourceText) -> _Expression:
    source_token = _ACTIVE_SOURCE.set(source)
    try:
        return cast(_Expression, _PARSER.parse(source.text))
    except UnexpectedInput as exc:
        position = (
            len(source.tokens)
            if isinstance(exc, UnexpectedToken) and exc.token.type == "$END"
            else exc.pos_in_stream
        )
        if position is None:
            position = len(source.tokens)
        if position < len(source.tokens):
            span = sympy_source.SourceSpan(
                source.tokens[position].raw_offset,
                source.tokens[position].raw_offset + 1,
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
    value = items[0]
    for item in items[1:]:
        value = _Binary(
            value,
            _implicit_operator(item.span),
            item,
            _combine(value.span, item.span),
        )
    return value


class _Lowerer:
    def __init__(
        self,
        source: sympy_source.SourceText,
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
        result: list[_Expression] = []

        def consume_function(index: int) -> tuple[_Expression, int]:
            marker = items[index]
            next_index = index + 1
            if next_index >= len(items):
                return marker, next_index
            if self._is_function_marker(items[next_index]):
                argument, next_index = consume_function(next_index)
            else:
                argument_items: list[_Expression] = []
                while next_index < len(items) and not self._is_function_marker(
                    items[next_index]
                ):
                    argument_items.append(items[next_index])
                    next_index += 1
                argument = _make_implicit_product(argument_items)
            return self._apply_function_marker(marker, argument), next_index

        index = 0
        while index < len(items):
            if self._is_function_marker(items[index]):
                value, index = consume_function(index)
                result.append(value)
            else:
                result.append(items[index])
                index += 1
        return _make_implicit_product(result)

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
        explicit: list[_Operator] = []
        current = [items[0]]
        for operator, item in zip(operators, items[1:], strict=True):
            if operator.text == "juxtapose":
                if isinstance(current[-1], _Number) and isinstance(item, _Number):
                    raise sympy_evaluation.ExpressionEvaluationError(
                        sympy_evaluation.ParseDiagnostic(item.span.start),
                        self.source,
                        item.span,
                    )
                current.append(item)
                continue
            segments.append(self._lower_implicit_segment(current))
            explicit.append(operator)
            current = [item]
        segments.append(self._lower_implicit_segment(current))

        value = segments[0]
        for operator, right in zip(explicit, segments[1:], strict=True):
            value = _Binary(value, operator, right, _combine(value.span, right.span))
        return value

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


@dataclass(frozen=True, slots=True)
class _Evaluated:
    value: sympy_evaluation.SympyValue | bool
    type: sympy_evaluation.SympyType


class Evaluator:
    def __init__(
        self,
        source: sympy_source.SourceText,
        context: sympy_evaluation.EvaluationContext,
    ) -> None:
        self.source = source
        self.functions = context.functions
        self.variables = context.variables
        self.unsupported_global_names = context.unsupported_global_names
        self.unsupported_global_functions = context.unsupported_global_functions
        self.allow_sets = context.allow_sets
        self.simplify_expression = context.simplify_expression
        self.allow_extra_symbols = context.allow_extra_symbols
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
                if expected is not None and argument.type != expected:
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
            result_type = sympy_evaluation.SympyType.SET
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
            result_type = sympy_evaluation.SympyType.SCALAR

        values = [argument.value for argument in arguments]
        kwargs: dict[str, bool] = {}
        if (
            not self.simplify_expression
            and name in sympy_constants.evaluate_false_functions
        ):
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
        return _Evaluated(cast(sympy_evaluation.SympyValue, value), result_type)

    def _binary(self, expression: _Binary) -> _Evaluated:
        left = self.evaluate(expression.left)
        right = self.evaluate(expression.right)
        operator = expression.operator.text
        scalar = sympy_evaluation.SympyType.SCALAR
        set_type = sympy_evaluation.SympyType.SET

        if operator in sympy_constants.set_operator_names:
            signatures = ((set_type, set_type),)
            result_type = set_type
        elif operator in {"+", "-"}:
            signatures = ((set_type, set_type), (scalar, scalar))
            result_type = left.type
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
                if operator in sympy_constants.union_operators | {"+"}:
                    value = sympy.Union(left_set, right_set)
                elif operator in sympy_constants.intersection_operators:
                    value = sympy.Intersection(left_set, right_set)
                else:
                    value = sympy.Complement(left_set, right_set)
            else:
                left_value = cast(sympy.Expr, left.value)
                right_value = cast(sympy.Expr, right.value)
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
        left_value: sympy.Expr,
        right_value: sympy.Expr,
    ) -> sympy.Expr:
        if self.simplify_expression:
            return {
                "+": lambda: left_value + right_value,
                "-": lambda: left_value - right_value,
                "*": lambda: left_value * right_value,
                "juxtapose": lambda: left_value * right_value,
                "/": lambda: left_value / right_value,
                "%": lambda: left_value % right_value,
                "**": lambda: left_value**right_value,
            }[operator]()

        def flatten(
            value: sympy.Expr, operation: type[sympy.Add | sympy.Mul]
        ) -> tuple[sympy.Expr, ...]:
            return value.args if isinstance(value, operation) else (value,)

        if operator == "+":
            return sympy.Add(
                *flatten(left_value, sympy.Add),
                *flatten(right_value, sympy.Add),
                evaluate=False,
            )
        if operator == "-":
            negative = sympy.Mul(-1, right_value, evaluate=False)
            return sympy.Add(
                *flatten(left_value, sympy.Add),
                *flatten(negative, sympy.Add),
                evaluate=False,
            )
        if operator in {"*", "juxtapose"}:
            return sympy.Mul(
                *flatten(left_value, sympy.Mul),
                *flatten(right_value, sympy.Mul),
                evaluate=False,
            )
        if operator == "/":
            reciprocal = sympy.Pow(right_value, -1, evaluate=False)
            return sympy.Mul(
                *flatten(left_value, sympy.Mul),
                *flatten(reciprocal, sympy.Mul),
                evaluate=False,
            )
        if operator == "%":
            return sympy.Mod(left_value, right_value, evaluate=False)
        return sympy.Pow(left_value, right_value, evaluate=False)

    def evaluate(self, expression: _Expression) -> _Evaluated:
        if isinstance(expression, _Number):
            number_value: sympy.Expr
            if "." in expression.text or "e" in expression.text.lower():
                number_value = sympy.Float(expression.text)
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
            if isinstance(name_value, sympy.Set):
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
        if isinstance(expression, _FiniteSet):
            if not self.allow_sets:
                self._raise(sympy_evaluation.SetNotationDiagnostic(), expression.span)
            items = tuple(map(self.evaluate, expression.items))
            return _Evaluated(
                sympy.FiniteSet(*(cast(sympy.Basic, item.value) for item in items)),
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
        raise AssertionError(expression)


def _parse_and_evaluate(
    source: sympy_source.SourceText,
    context: sympy_evaluation.EvaluationContext,
) -> tuple[sympy_evaluation.SympyValue, _Expression]:
    try:
        parsed = _parse(source)
        lowerer = _Lowerer(source, context)
        lowered = lowerer.lower(parsed)
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
    except Exception as exc:
        raise sympy_evaluation.ExpressionEvaluationError(
            sympy_evaluation.EvaluationFailureDiagnostic(), source, cause=exc
        ) from None
    if not context.allow_extra_symbols:
        valid_names = set(evaluator.variables)
        pending: list[sympy.Basic] = [result]
        invalid_name: str | None = None
        while pending:
            item = pending.pop()
            if isinstance(item, sympy.Symbol) and str(item) not in valid_names:
                invalid_name = str(item)
                break
            pending.extend(item.args)
        if invalid_name is not None:
            name = next(
                candidate
                for candidate in reversed(evaluator.unknown_names)
                if candidate.text == invalid_name
            )
            raise sympy_evaluation.ExpressionEvaluationError(
                sympy_evaluation.InvalidSymbolDiagnostic(name.text, name.span.start),
                source,
                name.span,
            )
    return result, lowered


def parse_and_evaluate(
    source: sympy_source.SourceText,
    context: sympy_evaluation.EvaluationContext,
) -> sympy_evaluation.SympyValue:
    """Parse normalized source and evaluate it without generated Python."""
    result, _lowered = _parse_and_evaluate(source, context)
    return result


def parse_and_evaluate_with_source(
    source: sympy_source.SourceText,
    context: sympy_evaluation.EvaluationContext,
) -> tuple[sympy_evaluation.SympyValue, str]:
    """Parse and evaluate normalized source, returning its lowered structure."""
    result, lowered = _parse_and_evaluate(source, context)
    return result, lowered.to_source()
