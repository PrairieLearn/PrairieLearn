"""Lightweight Python type hints for MathJSON values.

These aliases intentionally describe the broad recursive shape of MathJSON
instead of enumerating every built-in symbol or function arity. Runtime checks in
``mathjson_utils`` enforce the subset that `pl-symbolic-input` converts to
SymPy.
"""

from __future__ import annotations

from typing import TypedDict


class MathJsonAttributes(TypedDict, total=False):
    comment: str
    documentation: str
    latex: str
    wikidata: str
    wikibase: str
    openmathSymbol: str
    openmathCd: str
    sourceUrl: str
    sourceContent: str
    sourceOffsets: tuple[int, int]


class MathJsonNumberObject(MathJsonAttributes):
    num: str


class MathJsonSymbolObject(MathJsonAttributes):
    sym: str


class MathJsonStringObject(MathJsonAttributes):
    str: str


class MathJsonFunctionObject(MathJsonAttributes):
    fn: MathJsonFunctionExpression


class MathJsonDictionaryObject(MathJsonAttributes):
    dict: dict[str, DictionaryValue]


type MathJsonPrimitive = bool | int | float | str
type MathJsonSymbol = str
type MathJsonSymbolExpression = MathJsonSymbolObject | str
type MathJsonFunctionExpression = list[MathJsonExpression]
type DictionaryValue = MathJsonPrimitive | ExpressionObject | list[DictionaryValue]
type ExpressionObject = (
    MathJsonNumberObject
    | MathJsonStringObject
    | MathJsonSymbolObject
    | MathJsonFunctionObject
    | MathJsonDictionaryObject
)
type MathJsonExpression = (
    MathJsonPrimitive | ExpressionObject | MathJsonFunctionExpression
)
