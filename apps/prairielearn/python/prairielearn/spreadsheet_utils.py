"""Utilities for grading normalized ``pl-spreadsheet`` submissions."""

from __future__ import annotations

import datetime
import math
import numbers
import random
import re
import string
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import InitVar, dataclass, field
from pathlib import Path
from typing import (
    TYPE_CHECKING,
    Any,
    Literal,
    NotRequired,
    Protocol,
    TypedDict,
    cast,
    overload,
)

import numpy as np
import pandas as pd
from openpyxl.formula import Tokenizer

from prairielearn.grading_utils import grade_answer_parameterized
from prairielearn.question_utils import QuestionData, set_weighted_score_data

if TYPE_CHECKING:
    import os

SPREADSHEET_FORMULA_AST_VERSION = 1
_COLUMN_LETTERS = string.ascii_uppercase

type SheetName = str
"""Worksheet name used to qualify spreadsheet addresses."""

__all__ = [
    "SPREADSHEET_FORMULA_AST_VERSION",
    "Address",
    "AddressRange",
    "AddressSpace",
    "AddressSpaceMap",
    "Book",
    "BooleanInput",
    "BooleanResult",
    "Case",
    "CaseSpec",
    "Cell",
    "CellRange",
    "Comparison",
    "ComparisonSeries",
    "Definition",
    "EmptyResult",
    "ErrorResult",
    "FormulaAst",
    "FormulaAstNode",
    "FormulaBinaryNode",
    "FormulaCellRangeNode",
    "FormulaCellReference",
    "FormulaColumnRangeNode",
    "FormulaColumnReference",
    "FormulaEmptyNode",
    "FormulaFunctionNode",
    "FormulaGroupNode",
    "FormulaInput",
    "FormulaLiteralNode",
    "FormulaParseError",
    "FormulaPostfixNode",
    "FormulaRangeNode",
    "FormulaReferenceEndpoint",
    "FormulaReferenceNode",
    "FormulaRowRangeNode",
    "FormulaRowReference",
    "FormulaUnaryNode",
    "GradingBook",
    "Input",
    "NumberInput",
    "NumberResult",
    "Output",
    "OutputInput",
    "OutputSpec",
    "QualifiedAddress",
    "QualifiedAddressRange",
    "RandomInput",
    "Reference",
    "ReferenceCellInput",
    "ReferenceCellSpec",
    "ReferenceSpec",
    "Result",
    "Sheet",
    "SheetInput",
    "SheetName",
    "SheetSpec",
    "Snapshot",
    "SnapshotCase",
    "SnapshotCell",
    "SnapshotComparison",
    "SnapshotComparisonSeries",
    "SnapshotEngine",
    "SnapshotGrading",
    "SnapshotReference",
    "SnapshotReferenceSummary",
    "SnapshotSheet",
    "SourceBook",
    "SourceSheet",
    "SourceValue",
    "StringInput",
    "StringResult",
    "Value",
    "create_spreadsheet",
    "dataframe_to_spreadsheet_sheet",
    "dataframes_to_spreadsheet_book",
    "fill_formula",
    "get_spreadsheet_cell",
    "get_spreadsheet_formula",
    "get_spreadsheet_formula_ast",
    "get_spreadsheet_grading_output",
    "get_spreadsheet_result",
    "get_spreadsheet_value",
    "grade_reference",
    "parse_spreadsheet_formula",
    "random_cases",
    "read_spreadsheet",
    "read_spreadsheet_csv",
    "read_spreadsheet_tsv",
    "read_spreadsheet_xlsx",
    "rebase_spreadsheet_formula",
    "shift_formula",
]


class NumberInput(TypedDict):
    """Literal numeric input stored in a spreadsheet cell."""

    type: Literal["number"]
    value: int | float


class StringInput(TypedDict):
    """Literal text input stored in a spreadsheet cell."""

    type: Literal["string"]
    value: str


class BooleanInput(TypedDict):
    """Literal Boolean input stored in a spreadsheet cell."""

    type: Literal["boolean"]
    value: bool


class FormulaInput(TypedDict):
    """Formula input stored in a spreadsheet cell."""

    type: Literal["formula"]
    value: str


type Input = NumberInput | StringInput | BooleanInput | FormulaInput
"""Any supported typed spreadsheet cell input."""


class EmptyResult(TypedDict):
    """Calculated result representing an empty cell."""

    type: Literal["empty"]


class NumberResult(TypedDict):
    """Calculated numeric cell result."""

    type: Literal["number"]
    value: int | float


class StringResult(TypedDict):
    """Calculated text cell result."""

    type: Literal["string"]
    value: str


class BooleanResult(TypedDict):
    """Calculated Boolean cell result."""

    type: Literal["boolean"]
    value: bool


class ErrorResult(TypedDict):
    """Calculated spreadsheet error result."""

    type: Literal["error"]
    value: str
    error_type: str


type Result = EmptyResult | NumberResult | StringResult | BooleanResult | ErrorResult
"""Any supported typed spreadsheet calculation result."""

type Value = bool | int | float | str | None
"""Plain Python value exposed by a cell or grading output."""


def _spreadsheet_result_value(result: Result) -> Value:
    if result["type"] == "empty":
        return None
    if result["type"] == "error":
        return None
    return result["value"]


class SnapshotCell(TypedDict):
    """Normalized input and authoritative result for one populated cell."""

    input: Input
    result: Result


class SnapshotEngine(TypedDict):
    """Calculation-engine identity persisted with a normalized snapshot."""

    name: Literal["hyperformula"]
    version: str
    configuration_version: int


class SnapshotSheet(TypedDict):
    """Student-visible sheet persisted in a normalized snapshot."""

    name: SheetName
    rows: int
    columns: int
    cells: dict[str, SnapshotCell]


class SnapshotCase(TypedDict):
    """Named grading outputs recomputed for one hidden test case."""

    name: str
    outputs: dict[str, Result]


class SnapshotComparison(TypedDict):
    """Student and reference results for one cell or output in one run."""

    student: Result
    reference: Result
    match: bool


class SnapshotComparisonSeries(TypedDict):
    """Comparisons for the submitted inputs followed by every test case."""

    base: SnapshotComparison
    cases: list[SnapshotComparison]


class SnapshotReferenceSummary(TypedDict):
    """Number of matching comparisons across all cells, outputs, and cases."""

    matched: int
    total: int


class SnapshotReference(TypedDict):
    """Student-versus-reference comparisons persisted with a normalized snapshot."""

    cells: dict[str, SnapshotComparisonSeries]
    outputs: NotRequired[dict[str, SnapshotComparisonSeries]]
    summary: SnapshotReferenceSummary


class SnapshotGrading(TypedDict):
    """Named private grading results persisted with a normalized snapshot."""

    schema_version: Literal[2]
    grader_hash: str
    outputs: dict[str, Result]
    cases: NotRequired[list[SnapshotCase]]
    reference: NotRequired[SnapshotReference]


class Snapshot(TypedDict):
    """Validated, calculated spreadsheet submission used by graders."""

    schema_version: Literal[2]
    template_hash: str
    engine: SnapshotEngine
    sheets: list[SnapshotSheet]
    grading: NotRequired[SnapshotGrading]


@dataclass(frozen=True, slots=True)
class FormulaCellReference:
    """Parsed reference to one cell in a spreadsheet formula."""

    sheet: SheetName | None
    column: str
    row: int
    column_absolute: bool
    row_absolute: bool
    kind: Literal["cell"] = field(default="cell", init=False)


@dataclass(frozen=True, slots=True)
class FormulaColumnReference:
    """Parsed reference to one entire column in a spreadsheet formula."""

    sheet: SheetName | None
    column: str
    column_absolute: bool
    kind: Literal["column"] = field(default="column", init=False)


@dataclass(frozen=True, slots=True)
class FormulaRowReference:
    """Parsed reference to one entire row in a spreadsheet formula."""

    sheet: SheetName | None
    row: int
    row_absolute: bool
    kind: Literal["row"] = field(default="row", init=False)


type FormulaReferenceEndpoint = (
    FormulaCellReference | FormulaColumnReference | FormulaRowReference
)
"""A parsed cell, column, or row reference endpoint."""


@dataclass(frozen=True, slots=True)
class FormulaLiteralNode:
    """Literal value node in a spreadsheet formula AST."""

    value_type: Literal["number", "string", "boolean", "error"]
    value: bool | int | float | str
    type: Literal["literal"] = field(default="literal", init=False)


@dataclass(frozen=True, slots=True)
class FormulaReferenceNode:
    """Single-reference node in a spreadsheet formula AST."""

    reference: FormulaReferenceEndpoint
    type: Literal["reference"] = field(default="reference", init=False)


@dataclass(frozen=True, slots=True)
class FormulaCellRangeNode:
    """Cell-range node in a spreadsheet formula AST."""

    start: FormulaCellReference
    end: FormulaCellReference
    type: Literal["range"] = field(default="range", init=False)


@dataclass(frozen=True, slots=True)
class FormulaColumnRangeNode:
    """Whole-column range node in a spreadsheet formula AST."""

    start: FormulaColumnReference
    end: FormulaColumnReference
    type: Literal["range"] = field(default="range", init=False)


@dataclass(frozen=True, slots=True)
class FormulaRowRangeNode:
    """Whole-row range node in a spreadsheet formula AST."""

    start: FormulaRowReference
    end: FormulaRowReference
    type: Literal["range"] = field(default="range", init=False)


type FormulaRangeNode = (
    FormulaCellRangeNode | FormulaColumnRangeNode | FormulaRowRangeNode
)
"""Any parsed range node in a spreadsheet formula AST."""


@dataclass(frozen=True, slots=True)
class FormulaFunctionNode:
    """Function-call node in a spreadsheet formula AST."""

    name: str
    arguments: tuple[FormulaAstNode, ...]
    type: Literal["function"] = field(default="function", init=False)


@dataclass(frozen=True, slots=True)
class FormulaUnaryNode:
    """Prefix unary-operator node in a spreadsheet formula AST."""

    operator: Literal["+", "-"]
    operand: FormulaAstNode
    type: Literal["unary"] = field(default="unary", init=False)


@dataclass(frozen=True, slots=True)
class FormulaPostfixNode:
    """Postfix unary-operator node in a spreadsheet formula AST."""

    operator: Literal["%"]
    operand: FormulaAstNode
    type: Literal["postfix"] = field(default="postfix", init=False)


type _FormulaBinaryOperator = Literal[
    "+", "-", "*", "/", "^", "&", "=", "<>", "<", ">", "<=", ">="
]


@dataclass(frozen=True, slots=True)
class FormulaBinaryNode:
    """Binary-operator node in a spreadsheet formula AST."""

    operator: _FormulaBinaryOperator
    left: FormulaAstNode
    right: FormulaAstNode
    type: Literal["binary"] = field(default="binary", init=False)


@dataclass(frozen=True, slots=True)
class FormulaGroupNode:
    """Parenthesized-expression node in a spreadsheet formula AST."""

    expression: FormulaAstNode
    type: Literal["group"] = field(default="group", init=False)


@dataclass(frozen=True, slots=True)
class FormulaEmptyNode:
    """Missing-argument node in a spreadsheet formula AST."""

    type: Literal["empty"] = field(default="empty", init=False)


type FormulaAstNode = (
    FormulaLiteralNode
    | FormulaReferenceNode
    | FormulaRangeNode
    | FormulaFunctionNode
    | FormulaUnaryNode
    | FormulaPostfixNode
    | FormulaBinaryNode
    | FormulaGroupNode
    | FormulaEmptyNode
)
"""Any node in a parsed spreadsheet formula AST."""


@dataclass(frozen=True, slots=True)
class FormulaAst:
    """Versioned abstract syntax tree for a spreadsheet formula."""

    formula: str
    root: FormulaAstNode
    schema_version: Literal[1] = field(default=1, init=False)


class FormulaParseError(ValueError):
    """Raised when a formula cannot be represented by the grading AST."""


class _FormulaToken(Protocol):
    value: str
    type: str
    subtype: str


_CELL_ADDRESS_RE = re.compile(r"^([A-Z]+)([1-9][0-9]*)$")
_RANGE_ENDPOINT_RE = re.compile(r"^([A-Z]*)((?:[1-9][0-9]*)?)$")
_REFERENCE_CELL_RE = re.compile(r"^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$")
_REFERENCE_COLUMN_RE = re.compile(r"^(\$?)([A-Z]+)$")
_REFERENCE_ROW_RE = re.compile(r"^(\$?)([1-9][0-9]*)$")


def _column_index(column_name: str) -> int:
    result = 0
    for character in column_name:
        result = result * 26 + ord(character) - ord("A") + 1
    return result - 1


def _normalized_address(address: str) -> tuple[str, int, int]:
    normalized = address.upper()
    match = _CELL_ADDRESS_RE.fullmatch(normalized)
    if match is None:
        raise ValueError(f'Invalid spreadsheet cell address "{address}".')
    return normalized, int(match.group(2)) - 1, _column_index(match.group(1))


type _RangeEndpoint = tuple[int | None, int | None]


def _parse_range_endpoint(text: str) -> _RangeEndpoint:
    """Parse ``B2``, ``B``, or ``2`` into zero-based ``(row, column)``, using ``None`` for an omitted coordinate."""
    match = _RANGE_ENDPOINT_RE.fullmatch(text.upper())
    if match is None or not (match.group(1) or match.group(2)):
        raise ValueError(f'Invalid spreadsheet range endpoint "{text}".')
    row = int(match.group(2)) - 1 if match.group(2) else None
    column = _column_index(match.group(1)) if match.group(1) else None
    return row, column


def _resolve_range_endpoints(
    start: _RangeEndpoint,
    end: _RangeEndpoint,
    bounds: AddressRange | None,
    range_text: str,
) -> AddressRange:
    """Resolve endpoints, extending an omitted coordinate to the edge of ``bounds``."""
    if (start[0] is None and end[1] is None) or (start[1] is None and end[0] is None):
        raise ValueError(f'Invalid spreadsheet range "{range_text}".')
    is_open = None in (*start, *end)
    if is_open and bounds is None:
        raise ValueError(
            f'Spreadsheet range "{range_text}" is open-ended and needs sheet bounds to resolve.'
        )

    def axis(
        first: int | None, last: int | None, low: int, high: int
    ) -> tuple[int, int]:
        if first is None and last is None:
            return low, high
        first = high if first is None else first
        last = high if last is None else last
        return min(first, last), max(first, last)

    low = bounds.start if bounds is not None else Address(row=0, column=0)
    high = bounds.end if bounds is not None else low
    start_row, end_row = axis(start[0], end[0], low.row, high.row)
    start_column, end_column = axis(start[1], end[1], low.column, high.column)
    resolved = AddressRange(
        Address(row=start_row, column=start_column),
        Address(row=end_row, column=end_column),
    )
    if is_open and bounds is not None and resolved not in bounds:
        raise ValueError(f'Spreadsheet range "{range_text}" is outside {bounds}.')
    return resolved


def _is_open_range(range_text: str) -> bool:
    """Return whether any endpoint of an A1 range omits its row or column."""
    return any(None in _parse_range_endpoint(part) for part in range_text.split(":"))


def _validated_snapshot(snapshot: object) -> Mapping[str, object]:
    if not isinstance(snapshot, Mapping):
        raise TypeError("A spreadsheet snapshot must be a mapping.")
    if snapshot.get("schema_version") != 2:
        raise ValueError("The spreadsheet snapshot must use schema version 2.")
    return snapshot


def _get_sheet(snapshot: Snapshot, sheet_name: SheetName) -> Mapping[str, object]:
    sheets = _validated_snapshot(snapshot).get("sheets", [])
    if not isinstance(sheets, list):
        raise TypeError("The spreadsheet snapshot has an invalid sheets field.")
    for sheet in sheets:
        if isinstance(sheet, Mapping) and sheet.get("name") == sheet_name:
            return sheet
    raise KeyError(f'Unknown spreadsheet sheet "{sheet_name}".')


def get_spreadsheet_cell(
    snapshot: Snapshot, sheet_name: SheetName, address: str
) -> SnapshotCell | None:
    """Return a normalized cell, or ``None`` when the in-bounds cell is empty."""
    sheet = _get_sheet(snapshot, sheet_name)
    normalized, row, column = _normalized_address(address)
    rows = sheet.get("rows")
    columns = sheet.get("columns")
    if (
        isinstance(rows, bool)
        or not isinstance(rows, int)
        or isinstance(columns, bool)
        or not isinstance(columns, int)
    ):
        raise TypeError(f'Spreadsheet sheet "{sheet_name}" has invalid dimensions.')
    if row >= rows or column >= columns:
        raise ValueError(
            f'Spreadsheet cell "{sheet_name}!{normalized}" is outside the sheet.'
        )
    cells = sheet.get("cells", {})
    if not isinstance(cells, Mapping):
        raise TypeError(f'Spreadsheet sheet "{sheet_name}" has invalid cells.')
    cell = cells.get(normalized)
    if cell is None:
        return None
    if not isinstance(cell, dict):
        raise TypeError(f'Spreadsheet cell "{sheet_name}!{normalized}" is invalid.')
    return cast(SnapshotCell, cell)


def get_spreadsheet_result(
    snapshot: Snapshot, sheet_name: SheetName, address: str
) -> Result:
    """Return the typed calculated result for a cell."""
    cell = get_spreadsheet_cell(snapshot, sheet_name, address)
    if cell is None:
        return {"type": "empty"}
    result = cell.get("result")
    if not isinstance(result, dict) or not isinstance(result.get("type"), str):
        raise TypeError(
            f'Spreadsheet cell "{sheet_name}!{address}" has an invalid result.'
        )
    return result


def get_spreadsheet_value(
    snapshot: Snapshot, sheet_name: SheetName, address: str
) -> Value:
    """Return a scalar calculated value, or ``None`` for empty or error results."""
    return _spreadsheet_result_value(
        get_spreadsheet_result(snapshot, sheet_name, address)
    )


def get_spreadsheet_formula(
    snapshot: Snapshot, sheet_name: SheetName, address: str
) -> str | None:
    """Return the exact submitted formula text, or ``None`` for a non-formula cell."""
    cell = get_spreadsheet_cell(snapshot, sheet_name, address)
    if cell is None:
        return None
    cell_input = cell.get("input")
    if not isinstance(cell_input, dict) or cell_input.get("type") != "formula":
        return None
    formula = cell_input.get("value")
    if not isinstance(formula, str):
        raise TypeError(
            f'Spreadsheet cell "{sheet_name}!{address}" has an invalid formula.'
        )
    return formula


def get_spreadsheet_grading_output(snapshot: Snapshot, output_name: str) -> Result:
    """Return a named private-workbook output from a normalized snapshot."""
    grading = _validated_snapshot(snapshot).get("grading")
    if not isinstance(grading, Mapping):
        raise KeyError(
            "The spreadsheet snapshot does not contain private grading outputs."
        )
    if grading.get("schema_version") != 2:
        raise ValueError("Spreadsheet grading outputs must use schema version 2.")
    outputs = grading.get("outputs")
    if not isinstance(outputs, Mapping) or output_name not in outputs:
        raise KeyError(f'Unknown spreadsheet grading output "{output_name}".')
    result = outputs[output_name]
    if not isinstance(result, dict) or not isinstance(result.get("type"), str):
        raise TypeError(f'Spreadsheet grading output "{output_name}" is invalid.')
    return cast(Result, result)


def _decode_sheet_name(sheet_text: str) -> SheetName:
    if len(sheet_text) >= 2 and sheet_text.startswith("'") and sheet_text.endswith("'"):
        return sheet_text[1:-1].replace("''", "'")
    return sheet_text


def _parse_reference_endpoint(text: str) -> FormulaReferenceEndpoint:
    if "!" in text:
        sheet_text, reference = text.rsplit("!", 1)
        sheet = _decode_sheet_name(sheet_text)
    else:
        sheet = None
        reference = text
    reference = reference.upper()

    cell_match = _REFERENCE_CELL_RE.fullmatch(reference)
    if cell_match is not None:
        return FormulaCellReference(
            sheet=sheet,
            column=cell_match.group(2),
            row=int(cell_match.group(4)),
            column_absolute=cell_match.group(1) == "$",
            row_absolute=cell_match.group(3) == "$",
        )
    column_match = _REFERENCE_COLUMN_RE.fullmatch(reference)
    if column_match is not None:
        return FormulaColumnReference(
            sheet=sheet,
            column=column_match.group(2),
            column_absolute=column_match.group(1) == "$",
        )
    row_match = _REFERENCE_ROW_RE.fullmatch(reference)
    if row_match is not None:
        return FormulaRowReference(
            sheet=sheet,
            row=int(row_match.group(2)),
            row_absolute=row_match.group(1) == "$",
        )
    raise FormulaParseError(f'Unsupported spreadsheet reference "{text}".')


def _parse_reference(text: str) -> FormulaReferenceNode | FormulaRangeNode:
    if ":" not in text:
        return FormulaReferenceNode(reference=_parse_reference_endpoint(text))
    start_text, end_text = text.split(":", 1)
    start = _parse_reference_endpoint(start_text)
    end = _parse_reference_endpoint(end_text)
    if isinstance(start, FormulaCellReference) and isinstance(
        end, FormulaCellReference
    ):
        return FormulaCellRangeNode(start=start, end=end)
    if isinstance(start, FormulaColumnReference) and isinstance(
        end, FormulaColumnReference
    ):
        return FormulaColumnRangeNode(start=start, end=end)
    if isinstance(start, FormulaRowReference) and isinstance(end, FormulaRowReference):
        return FormulaRowRangeNode(start=start, end=end)
    raise FormulaParseError(
        f'Spreadsheet range "{text}" has incompatible endpoint types.'
    )


@dataclass(slots=True)
class _FormulaParser:
    """Stateful recursive-descent parser for tokenized spreadsheet formulas."""

    tokens: list[_FormulaToken]
    position: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        """Discard whitespace tokens before parsing."""
        self.tokens = [
            token
            for token in self.tokens
            if token.type not in {"WSPACE", "WHITE-SPACE"}
        ]

    def parse(self) -> FormulaAstNode:
        """Parse all remaining tokens into one formula AST node."""
        result = self._parse_comparison()
        token = self._current()
        if token is not None:
            raise FormulaParseError(
                f'Unexpected token "{token.value}" in spreadsheet formula.'
            )
        return result

    def _current(self) -> _FormulaToken | None:
        if self.position >= len(self.tokens):
            return None
        return self.tokens[self.position]

    def _take(self) -> _FormulaToken:
        token = self._current()
        if token is None:
            raise FormulaParseError("Unexpected end of spreadsheet formula.")
        self.position += 1
        return token

    def _parse_binary(
        self,
        operand_parser: Callable[[], FormulaAstNode],
        operators: set[_FormulaBinaryOperator],
    ) -> FormulaAstNode:
        result = operand_parser()
        while True:
            token = self._current()
            if (
                token is None
                or token.type != "OPERATOR-INFIX"
                or token.value not in operators
            ):
                return result
            operator = self._take().value
            right = operand_parser()
            result = FormulaBinaryNode(
                operator=cast(_FormulaBinaryOperator, operator),
                left=result,
                right=right,
            )

    def _parse_comparison(self) -> FormulaAstNode:
        return self._parse_binary(
            self._parse_concatenation, {"=", "<>", "<", ">", "<=", ">="}
        )

    def _parse_concatenation(self) -> FormulaAstNode:
        return self._parse_binary(self._parse_addition, {"&"})

    def _parse_addition(self) -> FormulaAstNode:
        return self._parse_binary(self._parse_multiplication, {"+", "-"})

    def _parse_multiplication(self) -> FormulaAstNode:
        return self._parse_binary(self._parse_power, {"*", "/"})

    def _parse_power(self) -> FormulaAstNode:
        return self._parse_binary(self._parse_prefix, {"^"})

    def _parse_prefix(self) -> FormulaAstNode:
        token = self._current()
        if (
            token is not None
            and token.type == "OPERATOR-PREFIX"
            and token.value in {"+", "-"}
        ):
            operator = self._take().value
            return FormulaUnaryNode(
                operator=cast(Literal["+", "-"], operator),
                operand=self._parse_prefix(),
            )
        return self._parse_postfix()

    def _parse_postfix(self) -> FormulaAstNode:
        result = self._parse_primary()
        while True:
            token = self._current()
            if token is None or token.type != "OPERATOR-POSTFIX" or token.value != "%":
                return result
            self._take()
            result = FormulaPostfixNode(operator="%", operand=result)

    def _parse_primary(self) -> FormulaAstNode:
        token = self._take()
        if token.type == "PAREN" and token.subtype == "OPEN":
            expression = self._parse_comparison()
            close = self._take()
            if close.type != "PAREN" or close.subtype != "CLOSE":
                raise FormulaParseError("Unclosed spreadsheet formula group.")
            return FormulaGroupNode(expression=expression)
        if token.type == "FUNC" and token.subtype == "OPEN":
            return self._parse_function(token)
        if token.type != "OPERAND":
            raise FormulaParseError(
                f'Unexpected token "{token.value}" in spreadsheet formula.'
            )
        if token.subtype == "RANGE":
            return _parse_reference(token.value)
        if token.subtype == "NUMBER":
            try:
                number = float(token.value)
            except ValueError as exc:
                raise FormulaParseError(
                    f'Invalid spreadsheet number literal "{token.value}".'
                ) from exc
            if not math.isfinite(number):
                raise FormulaParseError("Spreadsheet number literals must be finite.")
            number_value: int | float = int(number) if number.is_integer() else number
            return FormulaLiteralNode(value_type="number", value=number_value)
        if token.subtype == "TEXT":
            string_value = token.value[1:-1].replace('""', '"')
            return FormulaLiteralNode(value_type="string", value=string_value)
        if token.subtype == "LOGICAL":
            return FormulaLiteralNode(
                value_type="boolean", value=token.value.upper() == "TRUE"
            )
        if token.subtype == "ERROR":
            return FormulaLiteralNode(value_type="error", value=token.value.upper())
        raise FormulaParseError(f'Unsupported spreadsheet operand "{token.value}".')

    def _parse_function(self, opening: _FormulaToken) -> FormulaFunctionNode:
        arguments: list[FormulaAstNode] = []
        token = self._current()
        if token is not None and token.type == "FUNC" and token.subtype == "CLOSE":
            self._take()
            return FormulaFunctionNode(
                name=opening.value[:-1].upper(), arguments=tuple(arguments)
            )

        while True:
            token = self._current()
            if token is None:
                raise FormulaParseError("Unclosed spreadsheet function call.")
            if token.type == "SEP" and token.subtype == "ARG":
                arguments.append(FormulaEmptyNode())
                self._take()
                continue
            if token.type == "FUNC" and token.subtype == "CLOSE":
                arguments.append(FormulaEmptyNode())
                self._take()
                break
            arguments.append(self._parse_comparison())
            token = self._take()
            if token.type == "FUNC" and token.subtype == "CLOSE":
                break
            if token.type != "SEP" or token.subtype != "ARG":
                raise FormulaParseError(
                    f'Unexpected token "{token.value}" in spreadsheet function call.'
                )
            if self._current() is None:
                raise FormulaParseError("Unclosed spreadsheet function call.")

        return FormulaFunctionNode(
            name=opening.value[:-1].upper(), arguments=tuple(arguments)
        )


def parse_spreadsheet_formula(formula: str) -> FormulaAst:
    """Parse exact formula text into the versioned grading AST.

    This helper is intended for structural grading. HyperFormula remains authoritative
    for validating and calculating submitted formulas.

    Returns:
        A versioned AST that includes the exact original formula.

    Raises:
        FormulaParseError: If the formula cannot be represented by the AST.
    """
    if not isinstance(formula, str) or not formula.startswith("="):
        raise FormulaParseError('Spreadsheet formulas must start with "=".')
    try:
        tokens = cast(list[_FormulaToken], Tokenizer(formula).items)
        root = _FormulaParser(tokens).parse()
    except FormulaParseError:
        raise
    except Exception as exc:
        raise FormulaParseError("The spreadsheet formula could not be parsed.") from exc
    return FormulaAst(formula=formula, root=root)


def get_spreadsheet_formula_ast(
    snapshot: Snapshot, sheet_name: SheetName, address: str
) -> FormulaAst | None:
    """Return the versioned AST for a formula cell, or ``None`` otherwise."""
    formula = get_spreadsheet_formula(snapshot, sheet_name, address)
    return None if formula is None else parse_spreadsheet_formula(formula)


@dataclass(frozen=True, slots=True)
class Address:
    """Zero-based cell address within a sheet."""

    row: int
    column: int

    def __post_init__(self) -> None:
        """Validate zero-based row and column indexes."""
        if self.row < 0 or self.column < 0:
            raise ValueError("Spreadsheet row and column indexes must be non-negative.")

    @classmethod
    def from_a1(cls, address: str) -> Address:
        """Parse an unqualified A1 address."""
        _, row, column = _normalized_address(address)
        return cls(row=row, column=column)

    @property
    def address(self) -> str:
        """The normalized A1 address."""
        return f"{_column_name(self.column)}{self.row + 1}"

    @property
    def local_address(self) -> Address:
        """This unqualified address."""
        return self

    @property
    def sheet_name(self) -> None:
        """No sheet name because this address is unqualified."""
        return None

    def __str__(self) -> str:
        """Return the unqualified A1 address."""
        return self.address

    def offset(self, *, rows: int = 0, columns: int = 0) -> Address:
        """Return an address offset by a relative row and column count."""
        return Address(row=self.row + rows, column=self.column + columns)


_SAFE_NAME_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_.]*", re.ASCII)


def _safe_sheet_name(name: str) -> str:
    if not _SAFE_NAME_RE.fullmatch(name):
        return f"'{name.replace("'", "''")}'"
    return name


@dataclass(frozen=True, slots=True)
class QualifiedAddress:
    """Cell address qualified by its sheet name."""

    local: Address
    sheet_name: SheetName

    @classmethod
    def from_a1(cls, address: str) -> QualifiedAddress:
        """Parse a sheet-qualified A1 address."""
        if "!" not in address:
            raise ValueError(f'Invalid qualified spreadsheet address "{address}".')
        sheet_text, local_text = address.rsplit("!", 1)
        try:
            sheet_name = _decode_snapshot_sheet_name(sheet_text, address)
            local = Address.from_a1(local_text)
        except ValueError as exc:
            raise ValueError(
                f'Invalid qualified spreadsheet address "{address}".'
            ) from exc
        return cls(local=local, sheet_name=sheet_name)

    @property
    def address(self) -> str:
        """The normalized, safely quoted qualified A1 address."""
        name = _safe_sheet_name(self.sheet_name)
        return f"{name}!{self.local}"

    @property
    def local_address(self) -> Address:
        """The unqualified portion of this address."""
        return self.local

    def __str__(self) -> str:
        """Return the sheet-qualified A1 address."""
        return self.address


type _Address = Address | QualifiedAddress


@dataclass(frozen=True, slots=True)
class AddressRange:
    """Rectangular range of zero-based addresses within a sheet."""

    start: Address
    end: Address

    @classmethod
    def from_a1(
        cls, range_text: str, *, bounds: AddressRange | None = None
    ) -> AddressRange:
        """Parse and normalize an unqualified A1 cell or range reference.

        Like Google Sheets, a range endpoint may omit its row or column to extend
        the range to the edge of ``bounds``: ``B2:B`` runs from ``B2`` to the last
        row, ``A:C`` covers every row of columns A to C, and ``3:5`` covers every
        column of rows 3 to 5.

        Returns:
            The normalized range, running from top-left to bottom-right.

        Raises:
            ValueError: If the range is invalid, or is open-ended without ``bounds``
                or extends outside them.
        """
        parts = range_text.split(":")
        if len(parts) == 1:
            address = Address.from_a1(range_text)
            return cls(address, address)
        if len(parts) != 2:
            raise ValueError(f'Invalid spreadsheet range "{range_text}".')
        return _resolve_range_endpoints(
            _parse_range_endpoint(parts[0]),
            _parse_range_endpoint(parts[1]),
            bounds,
            range_text,
        )

    def __post_init__(self) -> None:
        """Validate that the range runs from top-left to bottom-right."""
        if self.start.row > self.end.row or self.start.column > self.end.column:
            raise ValueError(
                f'Spreadsheet range "{self}" must run from top-left to bottom-right.'
            )

    @property
    def address(self) -> str:
        """The normalized A1 range."""
        return str(self)

    @property
    def start_row(self) -> int:
        """The zero-based first row index."""
        return self.start.row

    @property
    def end_row(self) -> int:
        """The zero-based last row index, inclusive."""
        return self.end.row

    @property
    def start_column(self) -> int:
        """The zero-based first column index."""
        return self.start.column

    @property
    def end_column(self) -> int:
        """The zero-based last column index, inclusive."""
        return self.end.column

    @property
    def shape(self) -> tuple[int, int]:
        """The range dimensions as ``(rows, columns)``."""
        return (
            self.end.row - self.start.row + 1,
            self.end.column - self.start.column + 1,
        )

    def __contains__(self, ref: Address | AddressRange) -> bool:
        """Return whether an address or range is fully contained."""
        if isinstance(ref, Address):
            return (
                self.start.row <= ref.row <= self.end.row
                and self.start.column <= ref.column <= self.end.column
            )
        return ref.start in self and ref.end in self

    def contains_cell(self, row: int, column: int) -> bool:
        """Return whether the zero-based cell coordinates are inside the range."""
        return Address(row=row, column=column) in self

    def contains_range(self, other: AddressRange) -> bool:
        """Return whether another range is fully inside this range."""
        return other in self

    def intersection(self, other: _Range) -> AddressRange | None:
        """Return the overlap with another range, if any."""
        if isinstance(other, QualifiedAddressRange):
            other = other.local
        start = Address(
            row=max(self.start.row, other.start.row),
            column=max(self.start.column, other.start.column),
        )
        end = Address(
            row=min(self.end.row, other.end.row),
            column=min(self.end.column, other.end.column),
        )
        if start.row > end.row or start.column > end.column:
            return None
        return AddressRange(start, end)

    def to_source(self, relative: Address) -> Address:
        """Translate a zero-based address relative to this range into sheet space."""
        source = self.start.offset(rows=relative.row, columns=relative.column)
        if source not in self:
            raise ValueError("Relative spreadsheet address is outside its range.")
        return source

    def to_relative(self, source: Address) -> Address:
        """Translate a contained sheet address into zero-based range space."""
        if source not in self:
            raise ValueError("Spreadsheet address is outside its range.")
        return Address(
            row=source.row - self.start.row,
            column=source.column - self.start.column,
        )

    def __str__(self) -> str:
        """Return the unqualified A1 range."""
        return f"{self.start.address}:{self.end.address}"


# Excel's sheet limits, used to validate open-ended ranges before their sheet is known.
_UNBOUNDED_RANGE = AddressRange(
    Address(row=0, column=0), Address(row=1_048_575, column=16_383)
)


@dataclass(frozen=True, slots=True)
class AddressSpace:
    """A bounded mapping between source-workbook and student-local addresses."""

    source_range: AddressRange

    @classmethod
    def from_source_range(cls, source_range: str | AddressRange) -> AddressSpace:
        """Create an address space from an A1 source range."""
        if isinstance(source_range, str):
            source_range = AddressRange.from_a1(source_range)
        return cls(source_range=source_range)

    @property
    def shape(self) -> tuple[int, int]:
        """The address-space dimensions as ``(rows, columns)``."""
        return self.source_range.shape

    @property
    def student_range(self) -> AddressRange:
        """The zero-origin range exposed to the student."""
        rows, columns = self.shape
        return AddressRange(
            Address(row=0, column=0),
            Address(row=rows - 1, column=columns - 1),
        )

    def to_student_address(self, source: str | Address) -> Address:
        """Translate a bounded source address into the student coordinate space."""
        if isinstance(source, str):
            source = Address.from_a1(source)
        return self.source_range.to_relative(source)

    def to_source_address(self, student: str | Address) -> Address:
        """Translate a bounded student address into the source coordinate space."""
        if isinstance(student, str):
            student = Address.from_a1(student)
        return self.source_range.to_source(student)

    def to_student_range(self, source: str | AddressRange) -> AddressRange:
        """Translate a bounded source range into the student coordinate space."""
        if isinstance(source, str):
            source = AddressRange.from_a1(source, bounds=self.source_range)
        return AddressRange(
            self.to_student_address(source.start),
            self.to_student_address(source.end),
        )

    def to_source_range(self, student: str | AddressRange) -> AddressRange:
        """Translate a bounded student range into the source coordinate space."""
        if isinstance(student, str):
            student = AddressRange.from_a1(student, bounds=self.student_range)
        if student not in self.student_range:
            raise ValueError("Student spreadsheet range is outside its address space.")
        return AddressRange(
            self.to_source_address(student.start),
            self.to_source_address(student.end),
        )


@dataclass(frozen=True, slots=True)
class AddressSpaceMap:
    """Case-insensitive sheet address spaces for a student-visible workbook."""

    spaces: Mapping[SheetName, AddressSpace | str]
    _by_name: dict[str, tuple[SheetName, AddressSpace]] = field(init=False)

    def __post_init__(self) -> None:
        """Validate and index the case-insensitive sheet names."""
        by_name: dict[str, tuple[SheetName, AddressSpace]] = {}
        for name, value in self.spaces.items():
            folded = name.casefold()
            if folded in by_name:
                raise ValueError(f'Spreadsheet address space "{name}" is duplicated.')
            space = (
                AddressSpace.from_source_range(value)
                if isinstance(value, str)
                else value
            )
            by_name[folded] = (name, space)
        object.__setattr__(self, "_by_name", by_name)

    def __getitem__(self, sheet_name: SheetName) -> AddressSpace:
        """Return the bounded address space for a sheet name."""
        try:
            return self._by_name[sheet_name.casefold()][1]
        except KeyError:
            raise KeyError(
                f'Unknown student-visible spreadsheet sheet "{sheet_name}".'
            ) from None

    def canonical_name(self, sheet_name: SheetName) -> SheetName:
        """Return the original spelling of a case-insensitive sheet name."""
        try:
            return self._by_name[sheet_name.casefold()][0]
        except KeyError:
            raise KeyError(
                f'Unknown student-visible spreadsheet sheet "{sheet_name}".'
            ) from None


def _render_formula_reference_endpoint(
    endpoint: FormulaReferenceEndpoint,
    address_spaces: AddressSpaceMap,
    current_sheet: SheetName,
) -> str:
    target_sheet = endpoint.sheet or current_sheet
    space = address_spaces[target_sheet]
    prefix = (
        f"{_safe_sheet_name(address_spaces.canonical_name(target_sheet))}!"
        if endpoint.sheet
        else ""
    )
    if isinstance(endpoint, FormulaCellReference):
        student = space.to_student_address(
            Address(
                row=endpoint.row - 1,
                column=_column_index(endpoint.column),
            )
        )
        column = (
            f"{'$' if endpoint.column_absolute else ''}{_column_name(student.column)}"
        )
        row = f"{'$' if endpoint.row_absolute else ''}{student.row + 1}"
        return f"{prefix}{column}{row}"
    if isinstance(endpoint, FormulaColumnReference):
        source = Address(
            row=space.source_range.start.row,
            column=_column_index(endpoint.column),
        )
        student = space.to_student_address(source)
        return f"{prefix}{'$' if endpoint.column_absolute else ''}{_column_name(student.column)}"
    source = Address(
        row=endpoint.row - 1,
        column=space.source_range.start.column,
    )
    student = space.to_student_address(source)
    return f"{prefix}{'$' if endpoint.row_absolute else ''}{student.row + 1}"


def _rebase_formula_reference(
    reference: FormulaReferenceNode | FormulaRangeNode,
    address_spaces: AddressSpaceMap,
    current_sheet: SheetName,
) -> str:
    if isinstance(reference, FormulaReferenceNode):
        return _render_formula_reference_endpoint(
            reference.reference, address_spaces, current_sheet
        )
    target_sheets = {
        endpoint.sheet.casefold()
        for endpoint in (reference.start, reference.end)
        if endpoint.sheet is not None
    }
    if len(target_sheets) > 1:
        raise ValueError("Spreadsheet ranges cannot span multiple sheets.")
    start = _render_formula_reference_endpoint(
        reference.start, address_spaces, current_sheet
    )
    end = _render_formula_reference_endpoint(
        reference.end, address_spaces, reference.start.sheet or current_sheet
    )
    return f"{start}:{end}"


def rebase_spreadsheet_formula(
    formula: str,
    *,
    current_sheet: SheetName,
    address_spaces: AddressSpaceMap | Mapping[SheetName, AddressSpace | str],
) -> str:
    """Rewrite source-workbook formula references into student-local coordinates."""
    spaces = (
        address_spaces
        if isinstance(address_spaces, AddressSpaceMap)
        else AddressSpaceMap(address_spaces)
    )
    try:
        tokens = cast(list[_FormulaToken], Tokenizer(formula).items)
        rendered: list[str] = ["="]
        for token in tokens:
            if token.type == "OPERAND" and token.subtype == "RANGE":
                rendered.append(
                    _rebase_formula_reference(
                        _parse_reference(token.value), spaces, current_sheet
                    )
                )
            else:
                rendered.append(token.value)
        return "".join(rendered)
    except (KeyError, ValueError, FormulaParseError):
        raise
    except Exception as exc:
        raise FormulaParseError(
            "The spreadsheet formula could not be rebased."
        ) from exc


def _shift_formula_reference_endpoint(
    endpoint: FormulaReferenceEndpoint, rows: int, columns: int, text: str
) -> str:
    prefix = "" if endpoint.sheet is None else f"{_safe_sheet_name(endpoint.sheet)}!"
    parts: list[str] = []
    if not isinstance(endpoint, FormulaRowReference):
        column = _column_index(endpoint.column)
        if not endpoint.column_absolute:
            column += columns
        if column < 0:
            raise ValueError(f'Shifting reference "{text}" moves it left of column A.')
        parts.append(f"{'$' if endpoint.column_absolute else ''}{_column_name(column)}")
    if not isinstance(endpoint, FormulaColumnReference):
        row = endpoint.row
        if not endpoint.row_absolute:
            row += rows
        if row < 1:
            raise ValueError(f'Shifting reference "{text}" moves it above row 1.')
        parts.append(f"{'$' if endpoint.row_absolute else ''}{row}")
    return prefix + "".join(parts)


def shift_formula(formula: str, *, rows: int = 0, columns: int = 0) -> str:
    """Move a formula's relative references, as when copying it to another cell.

    References anchored with ``$`` keep their row or column. For example, shifting
    ``"=ABS(B2-$C1)"`` by one column gives ``"=ABS(C2-$C1)"``, and shifting it by
    one row gives ``"=ABS(B3-$C2)"``. A reference that would move above row 1 or
    left of column A raises ``ValueError``.

    Returns:
        The formula with every relative reference moved by ``rows`` and ``columns``.

    Raises:
        FormulaParseError: If the formula cannot be parsed.
    """
    if not isinstance(formula, str) or not formula.startswith("="):
        raise FormulaParseError('Spreadsheet formulas must start with "=".')
    try:
        tokens = cast(list[_FormulaToken], Tokenizer(formula).items)
    except Exception as exc:
        raise FormulaParseError("The spreadsheet formula could not be parsed.") from exc
    rendered: list[str] = ["="]
    for token in tokens:
        if token.type != "OPERAND" or token.subtype != "RANGE":
            rendered.append(token.value)
            continue
        reference = _parse_reference(token.value)
        if isinstance(reference, FormulaReferenceNode):
            rendered.append(
                _shift_formula_reference_endpoint(
                    reference.reference, rows, columns, token.value
                )
            )
        else:
            start = _shift_formula_reference_endpoint(
                reference.start, rows, columns, token.value
            )
            end = _shift_formula_reference_endpoint(
                reference.end, rows, columns, token.value
            )
            rendered.append(f"{start}:{end}")
    return "".join(rendered)


def fill_formula(
    target: str, formula: str, *, origin: str | None = None
) -> dict[str, str]:
    """Fill a formula across a range, like dragging a spreadsheet's fill handle.

    ``formula`` is written for the ``origin`` cell, which defaults to the first cell
    of ``target``. Every cell in ``target`` receives the formula shifted by its offset
    from ``origin`` (see :func:`shift_formula`). For example, filling
    ``"=ABS(B2-$C1)"`` across ``"D2:E2"`` gives ``E2`` the formula ``"=ABS(C2-$C1)"``.
    Set ``origin`` to the last cell of ``target`` to fill up or left instead.

    Returns:
        Formulas keyed by address in row-major order. Addresses are sheet-qualified
        when ``target`` is, so the result can be merged into a ``reference`` mapping;
        otherwise it can be used as a sheet's ``cells``.
    """
    sheet_name: SheetName | None = None
    local_text = target
    if "!" in target:
        sheet_text, local_text = target.rsplit("!", 1)
        sheet_name = _decode_snapshot_sheet_name(sheet_text, target)
    cells = AddressRange.from_a1(local_text)
    anchor = cells.start if origin is None else Address.from_a1(origin)
    filled: dict[str, str] = {}
    for row in range(cells.start.row, cells.end.row + 1):
        for column in range(cells.start.column, cells.end.column + 1):
            address = Address(row=row, column=column)
            key = (
                address.address
                if sheet_name is None
                else QualifiedAddress(address, sheet_name).address
            )
            filled[key] = shift_formula(
                formula, rows=row - anchor.row, columns=column - anchor.column
            )
    return filled


@dataclass(frozen=True, slots=True)
class QualifiedAddressRange:
    """Rectangular cell range qualified by its sheet name."""

    local: AddressRange
    sheet_name: SheetName

    @property
    def shape(self) -> tuple[int, int]:
        """The range dimensions as ``(rows, columns)``."""
        return self.local.shape

    def __contains__(self, ref: _Address | _Range) -> bool:
        """Return whether an address or range is contained on this sheet."""
        if isinstance(ref, QualifiedAddress | QualifiedAddressRange):
            return ref.sheet_name == self.sheet_name and ref.local in self.local
        return ref in self.local

    def intersection(self, other: _Range) -> QualifiedAddressRange | None:
        """Return the same-sheet overlap with another range, if any."""
        if isinstance(other, QualifiedAddressRange):
            if other.sheet_name != self.sheet_name:
                return None
            other = other.local
        intersection = self.local.intersection(other)
        if intersection is None:
            return None
        return QualifiedAddressRange(intersection, self.sheet_name)

    @property
    def address(self) -> str:
        """The normalized, safely quoted qualified A1 range."""
        name = _safe_sheet_name(self.sheet_name)
        return f"{name}!{self.local}"

    def __str__(self) -> str:
        """Return the sheet-qualified A1 range."""
        return self.address


type _Range = AddressRange | QualifiedAddressRange

type SourceValue = bool | int | float | str
"""JSON-safe value accepted in an authoring or imported source sheet."""


class SourceSheet(TypedDict):
    """Normalized source-sheet definition used to author a workbook."""

    name: str
    rows: int
    columns: int
    cells: dict[str, SourceValue]
    editable_ranges: NotRequired[list[str]]
    student_range: NotRequired[str]


class SourceBook(TypedDict):
    """Versioned public workbook definition without grading outputs."""

    schema_version: Literal[2]
    sheets: list[SourceSheet]


class OutputSpec(TypedDict):
    """Normalized declaration of one named private grading output."""

    sheet: SheetName
    cell: str
    required: NotRequired[bool]


type OutputInput = str | Mapping[str, object] | OutputSpec
"""Relaxed authoring input accepted for one named grading output."""


class CaseSpec(TypedDict):
    """Hidden test case that overrides parameter cells in source coordinates."""

    name: NotRequired[str]
    inputs: dict[str, SourceValue | None]


class ReferenceCellSpec(TypedDict):
    """Reference formula or value for one editable cell, with optional tolerances."""

    value: SourceValue
    rtol: NotRequired[float]
    atol: NotRequired[float]


type ReferenceCellInput = SourceValue | ReferenceCellSpec
"""Relaxed authoring input accepted for one reference cell."""


class ReferenceSpec(TypedDict):
    """Private reference solution compared against the student's workbook."""

    cells: dict[str, ReferenceCellSpec]
    rtol: NotRequired[float]
    atol: NotRequired[float]
    compare_outputs: NotRequired[bool]


class GradingBook(TypedDict):
    """Versioned private workbook definition with named grading outputs."""

    schema_version: Literal[2]
    sheets: list[SourceSheet]
    outputs: dict[str, OutputSpec]
    parameters: NotRequired[list[str]]
    test_cases: NotRequired[list[CaseSpec]]
    reference: NotRequired[ReferenceSpec]


type Definition = SourceBook | GradingBook
"""Any versioned workbook definition accepted by ``pl-spreadsheet``."""


class SheetSpec(TypedDict):
    """Relaxed options for authoring one spreadsheet sheet."""

    cells: NotRequired[Mapping[str, object]]
    rows: NotRequired[int]
    columns: NotRequired[int]
    editable_ranges: NotRequired[Sequence[str]]
    student_range: NotRequired[str]


type SheetInput = Mapping[str, object] | SheetSpec | SourceSheet
"""Relaxed direct-cell or structured input accepted for one sheet."""


def _is_missing_spreadsheet_value(value: object) -> bool:
    if value is None:
        return True
    missing = pd.isna(cast(Any, value))
    return isinstance(missing, bool | np.bool_) and bool(missing)


def _json_spreadsheet_cell_value(value: object, location: str) -> SourceValue | None:
    if _is_missing_spreadsheet_value(value):
        return None
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, str):
        return None if value == "" else value
    if isinstance(value, bool):
        return value
    if isinstance(value, numbers.Integral):
        return int(value)
    if isinstance(value, numbers.Real):
        number = float(value)
        if not math.isfinite(number):
            raise ValueError(f"Spreadsheet value at {location} must be finite.")
        return number
    if isinstance(
        value,
        datetime.date | datetime.datetime | datetime.time | datetime.timedelta,
    ):
        raise TypeError(
            f"Spreadsheet value at {location} is date- or time-like; convert it to a string or number first."
        )
    raise TypeError(
        f"Spreadsheet value at {location} must be a string, finite real number, boolean, or missing value."
    )


_SHEET_INPUT_KEYS = {
    "name",
    "cells",
    "rows",
    "columns",
    "editable_ranges",
    "student_range",
}


def _source_sheet_from_input(name: SheetName, raw_sheet: SheetInput) -> SourceSheet:
    is_structured = any(key in raw_sheet for key in _SHEET_INPUT_KEYS)
    if is_structured:
        unknown_keys = set(raw_sheet) - _SHEET_INPUT_KEYS
        if unknown_keys:
            unknown = min(str(key) for key in unknown_keys)
            raise ValueError(
                f'Spreadsheet sheet "{name}" has unknown option "{unknown}".'
            )
        supplied_name = raw_sheet.get("name")
        if supplied_name is not None and supplied_name != name:
            raise ValueError(
                f'Spreadsheet sheet "{name}" does not match its supplied name "{supplied_name}".'
            )
        raw_cells = raw_sheet.get("cells", {})
        raw_rows = raw_sheet.get("rows")
        raw_columns = raw_sheet.get("columns")
        raw_editable_ranges = raw_sheet.get("editable_ranges", ())
        raw_student_range = raw_sheet.get("student_range")
    else:
        raw_cells = raw_sheet
        raw_rows = None
        raw_columns = None
        raw_editable_ranges = ()
        raw_student_range = None

    if not isinstance(raw_cells, Mapping):
        raise TypeError(f'Spreadsheet sheet "{name}" cells must be a mapping.')
    cells: dict[str, SourceValue] = {}
    seen_addresses: set[str] = set()
    bounds = Address(row=0, column=0)
    for raw_address, value in raw_cells.items():
        if not isinstance(raw_address, str):
            raise TypeError(
                f'Spreadsheet cell addresses in sheet "{name}" must be strings.'
            )
        try:
            address = Address.from_a1(raw_address)
        except ValueError as exc:
            raise ValueError(
                f'Invalid spreadsheet cell address "{raw_address}" in sheet "{name}".'
            ) from exc
        canonical_address = address.address
        if canonical_address in seen_addresses:
            raise ValueError(
                f'Spreadsheet cell "{canonical_address}" is duplicated in sheet "{name}".'
            )
        seen_addresses.add(canonical_address)
        bounds = Address(
            row=max(bounds.row, address.row),
            column=max(bounds.column, address.column),
        )
        normalized = _json_spreadsheet_cell_value(value, f"{name}!{canonical_address}")
        if normalized is not None:
            cells[canonical_address] = normalized

    if isinstance(raw_editable_ranges, str) or not isinstance(
        raw_editable_ranges, Sequence
    ):
        raise TypeError(
            f'Spreadsheet sheet "{name}" editable_ranges must be a sequence of ranges.'
        )
    for raw_range in raw_editable_ranges:
        if not isinstance(raw_range, str):
            raise TypeError(
                f'Editable ranges in spreadsheet sheet "{name}" must be strings.'
            )
    if raw_student_range is not None and not isinstance(raw_student_range, str):
        raise TypeError(f'Spreadsheet sheet "{name}" student_range must be a string.')

    def parse_range(
        raw_range: str, description: str, range_bounds: AddressRange | None
    ) -> AddressRange:
        try:
            return AddressRange.from_a1(raw_range, bounds=range_bounds)
        except ValueError as exc:
            raise ValueError(
                f'Invalid {description} "{raw_range}" in spreadsheet sheet "{name}".'
            ) from exc

    # Closed ranges extend the inferred dimensions. Open-ended ranges such as "B2:B"
    # resolve only once the dimensions are known.
    for raw_range in [*raw_editable_ranges, raw_student_range]:
        if raw_range is not None and not _is_open_range(raw_range):
            closed_range = parse_range(raw_range, "range", None)
            bounds = Address(
                row=max(bounds.row, closed_range.end.row),
                column=max(bounds.column, closed_range.end.column),
            )

    def dimension(value: object, inferred: int, dimension_name: str) -> int:
        if value is None:
            return inferred
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError(
                f'Spreadsheet sheet "{name}" {dimension_name} must be a positive integer.'
            )
        if value < inferred:
            raise ValueError(
                f'Spreadsheet sheet "{name}" {dimension_name} does not contain its cells and ranges.'
            )
        return value

    rows = dimension(raw_rows, bounds.row + 1, "rows")
    columns = dimension(raw_columns, bounds.column + 1, "columns")
    sheet_range = AddressRange(
        Address(row=0, column=0), Address(row=rows - 1, column=columns - 1)
    )

    student_range: AddressRange | None = None
    if raw_student_range is not None:
        student_range = parse_range(raw_student_range, "student range", sheet_range)
        for address in cells:
            if Address.from_a1(address) not in student_range:
                raise ValueError(
                    f'Spreadsheet cell "{address}" is outside the student range for sheet "{name}".'
                )

    editable_ranges: list[str] = []
    for raw_range in raw_editable_ranges:
        editable_range = parse_range(
            raw_range, "editable range", student_range or sheet_range
        )
        if student_range is not None and editable_range not in student_range:
            raise ValueError(
                f'Editable range "{editable_range}" is outside the student range for sheet "{name}".'
            )
        editable_ranges.append(editable_range.address)

    sheet: SourceSheet = {
        "name": name,
        "rows": rows,
        "columns": columns,
        "cells": cells,
    }
    if editable_ranges:
        sheet["editable_ranges"] = editable_ranges
    if student_range is not None:
        sheet["student_range"] = student_range.address
    return sheet


@overload
def create_spreadsheet(
    sheets: Mapping[SheetName, SheetInput],
    *,
    outputs: None = None,
    parameters: None = None,
    test_cases: None = None,
    reference: None = None,
    rtol: None = None,
    atol: None = None,
    compare_outputs: None = None,
) -> SourceBook: ...


@overload
def create_spreadsheet(
    sheets: Mapping[SheetName, SheetInput] | None = None,
    *,
    outputs: Mapping[str, OutputInput],
    parameters: Sequence[str] | None = None,
    test_cases: Sequence[Mapping[str, object]] | None = None,
    reference: Mapping[str, ReferenceCellInput] | None = None,
    rtol: float | None = None,
    atol: float | None = None,
    compare_outputs: bool | None = None,
) -> GradingBook: ...


@overload
def create_spreadsheet(
    sheets: Mapping[SheetName, SheetInput] | None = None,
    *,
    outputs: Mapping[str, OutputInput] | None = None,
    parameters: Sequence[str] | None = None,
    test_cases: Sequence[Mapping[str, object]] | None = None,
    reference: Mapping[str, ReferenceCellInput],
    rtol: float | None = None,
    atol: float | None = None,
    compare_outputs: bool | None = None,
) -> GradingBook: ...


def create_spreadsheet(
    sheets: Mapping[SheetName, SheetInput] | None = None,
    *,
    outputs: Mapping[str, OutputInput] | None = None,
    parameters: Sequence[str] | None = None,
    test_cases: Sequence[Mapping[str, object]] | None = None,
    reference: Mapping[str, ReferenceCellInput] | None = None,
    rtol: float | None = None,
    atol: float | None = None,
    compare_outputs: bool | None = None,
) -> Definition:
    """Build a versioned authoring workbook from relaxed sheet dictionaries.

    Passing ``outputs`` or ``reference`` builds a private grading workbook, whose
    private ``sheets`` are optional. All addresses in ``parameters``, ``test_cases``,
    and ``reference`` use source coordinates, like private sheets and outputs.
    ``rtol``, ``atol``, and ``compare_outputs`` configure the reference comparison.

    Returns:
        A source workbook, or a private grading workbook.

    Raises:
        TypeError: If an argument has an unsupported type.
        ValueError: If an argument has an invalid value.
    """
    is_grading_book = outputs is not None or reference is not None
    if sheets is None and is_grading_book:
        sheets = {}
    if not isinstance(sheets, Mapping):
        raise TypeError("create_spreadsheet() requires a mapping of sheets.")
    if is_grading_book and len(sheets) > 10:
        raise ValueError("A private grading workbook may contain at most 10 sheets.")
    if not is_grading_book and not 1 <= len(sheets) <= 10:
        raise ValueError("A spreadsheet workbook must contain 1 to 10 sheets.")

    normalized_names: set[str] = set()
    normalized_sheets: list[SourceSheet] = []
    for name, raw_sheet in sheets.items():
        if not isinstance(name, str):
            raise TypeError("Spreadsheet sheet names must be strings.")
        normalized_name = name.casefold()
        if normalized_name in normalized_names:
            raise ValueError(f'Spreadsheet sheet name "{name}" is duplicated.')
        normalized_names.add(normalized_name)
        if not isinstance(raw_sheet, Mapping):
            raise TypeError(f'Spreadsheet sheet "{name}" must be a mapping.')
        normalized_sheets.append(_source_sheet_from_input(name, raw_sheet))

    if reference is None and (
        rtol is not None or atol is not None or compare_outputs is not None
    ):
        raise ValueError(
            "Spreadsheet rtol, atol, and compare_outputs require a reference solution."
        )
    if outputs is None and reference is None:
        if parameters is not None or test_cases is not None:
            raise ValueError(
                "Spreadsheet parameters and test cases require outputs or a reference solution."
            )
        return {"schema_version": 2, "sheets": normalized_sheets}
    min_outputs = 1 if reference is None else 0
    if outputs is not None and (
        not isinstance(outputs, Mapping) or not min_outputs <= len(outputs) <= 100
    ):
        raise ValueError(
            "A private spreadsheet grading workbook must contain 1 to 100 outputs."
        )

    normalized_outputs: dict[str, OutputSpec] = {}
    for name, raw_output in (outputs or {}).items():
        if not isinstance(name, str) or not name:
            raise TypeError("Spreadsheet output names must be non-empty strings.")
        if isinstance(raw_output, str):
            sheet_name: object = None
            cell = raw_output
            required: object = False
        elif isinstance(raw_output, Mapping):
            unknown_keys = set(raw_output) - {"sheet", "cell", "required"}
            if unknown_keys:
                unknown = min(str(key) for key in unknown_keys)
                raise ValueError(
                    f'Spreadsheet output "{name}" has unknown option "{unknown}".'
                )
            sheet_name = raw_output.get("sheet")
            cell = raw_output.get("cell")
            required = raw_output.get("required", False)
        else:
            raise TypeError(
                f'Spreadsheet output "{name}" must be a qualified address string or mapping.'
            )

        if sheet_name is not None and not isinstance(sheet_name, str):
            raise TypeError(f'Spreadsheet output "{name}" sheet must be a string.')
        if not isinstance(cell, str):
            raise TypeError(f'Spreadsheet output "{name}" cell must be a string.')
        if "!" in cell:
            try:
                qualified_cell = QualifiedAddress.from_a1(cell)
            except ValueError as exc:
                raise ValueError(
                    f'Spreadsheet output "{name}" has invalid qualified cell address "{cell}".'
                ) from exc
            if sheet_name is not None and sheet_name != qualified_cell.sheet_name:
                raise ValueError(
                    f'Spreadsheet output "{name}" sheet "{sheet_name}" conflicts with cell address "{cell}".'
                )
            sheet_name = qualified_cell.sheet_name
            normalized_cell = qualified_cell.local.address
        else:
            if sheet_name is None:
                raise ValueError(
                    f'Spreadsheet output "{name}" must provide a sheet or use a qualified cell address.'
                )
            try:
                normalized_cell = Address.from_a1(cell).address
            except ValueError as exc:
                raise ValueError(
                    f'Spreadsheet output "{name}" has invalid cell address "{cell}".'
                ) from exc
        if not isinstance(required, bool):
            raise TypeError(f'Spreadsheet output "{name}" required must be a boolean.')
        assert isinstance(sheet_name, str)
        output: OutputSpec = {"sheet": sheet_name, "cell": normalized_cell}
        if required:
            output["required"] = True
        normalized_outputs[name] = output

    book: GradingBook = {
        "schema_version": 2,
        "sheets": normalized_sheets,
        "outputs": normalized_outputs,
    }
    if parameters is not None:
        book["parameters"] = [
            _qualified_range_text(parameter, "Spreadsheet parameter")
            for parameter in parameters
        ]
    if test_cases is not None:
        book["test_cases"] = [
            _case_spec(case, index) for index, case in enumerate(test_cases, start=1)
        ]
    if reference is not None:
        book["reference"] = _reference_spec(
            reference, rtol=rtol, atol=atol, compare_outputs=compare_outputs
        )
    return book


def _qualified_cell_text(address: object, description: str) -> str:
    if not isinstance(address, str):
        raise TypeError(f"{description} address must be a string.")
    try:
        return QualifiedAddress.from_a1(address).address
    except ValueError as exc:
        raise ValueError(
            f'{description} address "{address}" must be sheet-qualified, such as "Inputs!B2".'
        ) from exc


def _qualified_range_text(range_text: object, description: str) -> str:
    if not isinstance(range_text, str) or "!" not in range_text:
        raise ValueError(
            f'{description} range must be sheet-qualified, such as "Inputs!B2:B5".'
        )
    sheet_text, local_text = range_text.rsplit("!", 1)
    try:
        sheet_name = QualifiedAddress.from_a1(f"{sheet_text}!A1").sheet_name
        if _is_open_range(local_text):
            # The sheet bounds are unknown here, so pl-spreadsheet resolves it.
            AddressRange.from_a1(local_text, bounds=_UNBOUNDED_RANGE)
            return f"{_safe_sheet_name(sheet_name)}!{local_text.upper()}"
        return QualifiedAddressRange(
            AddressRange.from_a1(local_text), sheet_name
        ).address
    except ValueError as exc:
        raise ValueError(f'{description} range "{range_text}" is invalid.') from exc


def _case_spec(raw_case: object, index: int) -> CaseSpec:
    if not isinstance(raw_case, Mapping) or set(raw_case) - {"name", "inputs"}:
        raise ValueError(
            f'Spreadsheet test case {index} must be a mapping with "inputs" and an optional "name".'
        )
    raw_inputs = raw_case.get("inputs")
    if not isinstance(raw_inputs, Mapping):
        raise TypeError(f"Spreadsheet test case {index} inputs must be a mapping.")
    case: CaseSpec = {"inputs": {}}
    for address, value in raw_inputs.items():
        key = _qualified_cell_text(address, f"Spreadsheet test case {index} input")
        if key in case["inputs"]:
            raise ValueError(
                f'Spreadsheet test case {index} sets "{key}" more than once.'
            )
        case["inputs"][key] = _json_spreadsheet_cell_value(value, key)
    if "name" in raw_case:
        name = raw_case["name"]
        if not isinstance(name, str):
            raise TypeError(f"Spreadsheet test case {index} name must be a string.")
        case["name"] = name
    return case


def _reference_spec(
    reference: Mapping[str, ReferenceCellInput],
    *,
    rtol: float | None,
    atol: float | None,
    compare_outputs: bool | None,
) -> ReferenceSpec:
    if not isinstance(reference, Mapping) or not reference:
        raise ValueError(
            "A spreadsheet reference solution must define at least one cell."
        )
    spec: ReferenceSpec = {"cells": {}}
    for address, raw_cell in reference.items():
        key = _qualified_cell_text(address, "Spreadsheet reference cell")
        if key in spec["cells"]:
            raise ValueError(f'Spreadsheet reference cell "{key}" is duplicated.')
        options: Mapping[str, object] = (
            raw_cell if isinstance(raw_cell, Mapping) else {"value": raw_cell}
        )
        if "value" not in options or set(options) - {"value", "rtol", "atol"}:
            raise ValueError(
                f'Spreadsheet reference cell "{key}" must be a value or a mapping with "value" and optional "rtol" and "atol".'
            )
        value = _json_spreadsheet_cell_value(options["value"], key)
        if value is None:
            raise ValueError(f'Spreadsheet reference cell "{key}" must not be empty.')
        cell: ReferenceCellSpec = {"value": value}
        if "rtol" in options:
            cell["rtol"] = _tolerance(options["rtol"], f'Reference cell "{key}" rtol')
        if "atol" in options:
            cell["atol"] = _tolerance(options["atol"], f'Reference cell "{key}" atol')
        spec["cells"][key] = cell
    if rtol is not None:
        spec["rtol"] = _tolerance(rtol, "Spreadsheet reference rtol")
    if atol is not None:
        spec["atol"] = _tolerance(atol, "Spreadsheet reference atol")
    if compare_outputs is not None:
        if not isinstance(compare_outputs, bool):
            raise TypeError("Spreadsheet compare_outputs must be a boolean.")
        spec["compare_outputs"] = compare_outputs
    return spec


def _tolerance(value: object, description: str) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, numbers.Real)
        or not math.isfinite(float(value))
        or float(value) < 0
    ):
        raise ValueError(f"{description} must be a non-negative finite number.")
    return float(value)


type RandomInput = (
    tuple[int, int]
    | tuple[float, float]
    | Sequence[SourceValue]
    | Callable[[], SourceValue | None]
)
"""Generator for one random test-case input: a range, choices, or a callable."""


def random_cases(
    count: int,
    inputs: Mapping[str, RandomInput],
    *,
    name: str = "Random case {index}",
) -> list[CaseSpec]:
    """Generate hidden test cases from Python's ``random`` module.

    PrairieLearn seeds ``random`` per variant before ``generate()``, so the cases
    are deterministic for each variant. Each input is generated from:

    - a ``(low, high)`` tuple of two numbers: ``random.randint`` when both are
      integers, otherwise ``random.uniform``;
    - any other non-string sequence: ``random.choice``;
    - a zero-argument callable: its return value.

    Returns:
        A list of test cases for ``create_spreadsheet(test_cases=...)``.

    Raises:
        ValueError: If ``count`` is not between 0 and 50.
        TypeError: If an input generator is not supported.
    """
    if isinstance(count, bool) or not isinstance(count, int) or not 0 <= count <= 50:
        raise ValueError("Spreadsheet random_cases() count must be between 0 and 50.")
    cases: list[CaseSpec] = []
    for index in range(1, count + 1):
        values: dict[str, SourceValue | None] = {}
        for address, generator in inputs.items():
            if callable(generator):
                values[address] = generator()
            elif (
                isinstance(generator, tuple)
                and len(generator) == 2
                and all(
                    isinstance(bound, numbers.Real) and not isinstance(bound, bool)
                    for bound in generator
                )
            ):
                low, high = generator
                values[address] = (
                    random.randint(int(low), int(high))
                    if isinstance(low, numbers.Integral)
                    and isinstance(high, numbers.Integral)
                    else random.uniform(float(low), float(high))
                )
            elif (
                isinstance(generator, Sequence)
                and not isinstance(generator, str)
                and generator
            ):
                values[address] = random.choice(generator)
            else:
                raise TypeError(
                    f'Spreadsheet random input "{address}" must be a (low, high) tuple, a non-empty sequence, or a callable.'
                )
        cases.append({"name": name.format(index=index), "inputs": values})
    return cases


def dataframe_to_spreadsheet_sheet(
    dataframe: pd.DataFrame,
    *,
    name: str = "Sheet1",
    start_cell: str = "A1",
    include_columns: bool = False,
    include_index: bool = False,
    editable_ranges: Sequence[str] = (),
) -> SourceSheet:
    """Convert a DataFrame to a sparse, JSON-safe spreadsheet sheet dictionary."""
    if not isinstance(dataframe, pd.DataFrame):
        raise TypeError("dataframe_to_spreadsheet_sheet() requires a pandas DataFrame.")
    if include_columns and isinstance(dataframe.columns, pd.MultiIndex):
        raise TypeError("Spreadsheet column labels must not use a pandas MultiIndex.")
    if include_index and isinstance(dataframe.index, pd.MultiIndex):
        raise TypeError("Spreadsheet index labels must not use a pandas MultiIndex.")

    start = Address.from_a1(start_cell)
    value_row = start.row + int(include_columns)
    value_column = start.column + int(include_index)
    cells: dict[str, SourceValue] = {}

    def add_cell(row: int, column: int, value: object, description: str) -> None:
        address = Address(row=row, column=column).address
        normalized = _json_spreadsheet_cell_value(
            value, f"{name}!{address} ({description})"
        )
        if normalized is not None:
            cells[address] = normalized

    if include_columns:
        for column_offset, label in enumerate(dataframe.columns):
            add_cell(start.row, value_column + column_offset, label, "column label")
    if include_index:
        for row_offset, label in enumerate(dataframe.index):
            add_cell(value_row + row_offset, start.column, label, "index label")
    for row_offset, row in enumerate(dataframe.itertuples(index=False, name=None)):
        for column_offset, value in enumerate(row):
            add_cell(
                value_row + row_offset,
                value_column + column_offset,
                value,
                "data value",
            )

    written_rows = len(dataframe.index) + int(include_columns)
    written_columns = len(dataframe.columns) + int(include_index)
    return {
        "name": name,
        "rows": start.row + max(written_rows, 1),
        "columns": start.column + max(written_columns, 1),
        "cells": cells,
        "editable_ranges": list(editable_ranges),
    }


def dataframes_to_spreadsheet_book(
    frames: Mapping[str, pd.DataFrame],
    *,
    include_columns: bool = False,
    include_index: bool = False,
) -> SourceBook:
    """Convert an ordered mapping of sheet names and DataFrames to a sheetbook."""
    if not isinstance(frames, Mapping):
        raise TypeError(
            "dataframes_to_spreadsheet_book() requires a mapping of DataFrames."
        )
    if not 1 <= len(frames) <= 10:
        raise ValueError("A spreadsheet sheetbook must contain 1 to 10 sheets.")

    names: set[str] = set()
    sheets: list[SourceSheet] = []
    for name, dataframe in frames.items():
        if not isinstance(name, str):
            raise TypeError("Spreadsheet sheet names must be strings.")
        folded_name = name.casefold()
        if folded_name in names:
            raise ValueError(f'Spreadsheet sheet name "{name}" is duplicated.')
        names.add(folded_name)
        sheets.append(
            dataframe_to_spreadsheet_sheet(
                dataframe,
                name=name,
                include_columns=include_columns,
                include_index=include_index,
            )
        )
    return {"schema_version": 2, "sheets": sheets}


def read_spreadsheet_csv(
    source: str | os.PathLike[str], *, sheet_name: str = "Sheet1"
) -> SourceBook:
    """Read a headerless CSV file into a JSON-safe single-sheet sheetbook."""
    dataframe = pd.read_csv(
        source, header=None, sep=",", keep_default_na=False, na_filter=False
    )
    return dataframes_to_spreadsheet_book({sheet_name: dataframe})


def read_spreadsheet_tsv(
    source: str | os.PathLike[str], *, sheet_name: str = "Sheet1"
) -> SourceBook:
    """Read a headerless TSV file into a JSON-safe single-sheet sheetbook."""
    dataframe = pd.read_csv(
        source, header=None, sep="\t", keep_default_na=False, na_filter=False
    )
    return dataframes_to_spreadsheet_book({sheet_name: dataframe})


def read_spreadsheet_xlsx(source: str | os.PathLike[str]) -> SourceBook:
    """Read all XLSX worksheets, preserving formula text, into a sheetbook."""
    frames = pd.read_excel(
        source,
        sheet_name=None,
        header=None,
        keep_default_na=False,
        engine="openpyxl",
        engine_kwargs={"data_only": False},
    )
    if not isinstance(frames, dict):
        raise TypeError("The XLSX spreadsheet reader returned an invalid sheetbook.")
    return dataframes_to_spreadsheet_book(frames)


def read_spreadsheet(
    source: str | os.PathLike[str], *, sheet_name: str = "Sheet1"
) -> SourceBook:
    """Read a CSV, TSV, or XLSX source file into a JSON-safe sheetbook."""
    suffix = Path(source).suffix.lower()
    if suffix == ".csv":
        return read_spreadsheet_csv(source, sheet_name=sheet_name)
    if suffix == ".tsv":
        return read_spreadsheet_tsv(source, sheet_name=sheet_name)
    if suffix == ".xlsx":
        return read_spreadsheet_xlsx(source)
    raise ValueError("Spreadsheet source files must use .csv, .tsv, or .xlsx.")


@dataclass(frozen=True, slots=True)
class _SnapshotEndpoint:
    """Parsed reference endpoint, which omits its row or column when open-ended."""

    sheet_name: SheetName | None
    row: int | None
    column: int | None

    @property
    def coordinates(self) -> _RangeEndpoint:
        return (self.row, self.column)

    def to_address(self) -> _Address:
        assert self.row is not None
        assert self.column is not None
        local = Address(row=self.row, column=self.column)
        if self.sheet_name is None:
            return local
        return QualifiedAddress(local=local, sheet_name=self.sheet_name)


@dataclass(frozen=True, slots=True)
class _SnapshotReference:
    """Parsed cell or range reference from a spreadsheet snapshot."""

    start: _SnapshotEndpoint
    end: _SnapshotEndpoint | None


@dataclass(frozen=True, slots=True)
class _EvaluatedCell:
    """Validated input and calculated result for a populated cell."""

    input: Input
    result: Result


@dataclass(frozen=True, slots=True)
class _SparseSheet:
    """Validated dimensions and sparse populated-cell data for one sheet."""

    name: SheetName
    rows: int
    columns: int
    visible_range: AddressRange
    addressed_data: dict[str, _EvaluatedCell]

    def __contains__(self, ref: _Address) -> bool:
        """Return whether an address lies inside this sheet's visible range."""
        return ref in QualifiedAddressRange(self.visible_range, self.name)


def _validated_snapshot_input(value: object, context: str) -> Input:
    if not isinstance(value, dict):
        raise TypeError(f"{context} has an invalid input.")
    input_type = value.get("type")
    input_value = value.get("value")
    if input_type == "number":
        if (
            isinstance(input_value, bool)
            or not isinstance(input_value, int | float)
            or not math.isfinite(input_value)
        ):
            raise TypeError(f"{context} has an invalid input.")
        return {"type": "number", "value": input_value}
    if input_type == "string":
        if not isinstance(input_value, str):
            raise TypeError(f"{context} has an invalid input.")
        return {"type": "string", "value": input_value}
    if input_type == "formula":
        if not isinstance(input_value, str) or not input_value.startswith("="):
            raise TypeError(f"{context} has an invalid input.")
        return {"type": "formula", "value": input_value}
    if input_type == "boolean":
        if not isinstance(input_value, bool):
            raise TypeError(f"{context} has an invalid input.")
        return {"type": "boolean", "value": input_value}
    raise TypeError(f"{context} has an invalid input.")


def _validated_snapshot_result(value: object, context: str) -> Result:
    if not isinstance(value, dict):
        raise TypeError(f"{context} has an invalid result.")
    result_type = value.get("type")
    result_value = value.get("value")
    if result_type == "empty":
        return {"type": "empty"}
    if result_type == "number":
        if (
            isinstance(result_value, bool)
            or not isinstance(result_value, int | float)
            or not math.isfinite(result_value)
        ):
            raise TypeError(f"{context} has an invalid result.")
        return {"type": "number", "value": result_value}
    if result_type == "string":
        if not isinstance(result_value, str):
            raise TypeError(f"{context} has an invalid result.")
        return {"type": "string", "value": result_value}
    if result_type == "boolean":
        if not isinstance(result_value, bool):
            raise TypeError(f"{context} has an invalid result.")
        return {"type": "boolean", "value": result_value}
    if result_type == "error":
        error_type = value.get("error_type")
        if not isinstance(result_value, str) or not isinstance(error_type, str):
            raise TypeError(f"{context} has an invalid result.")
        return {"type": "error", "value": result_value, "error_type": error_type}
    raise TypeError(f"{context} has an invalid result.")


def _decode_snapshot_sheet_name(sheet_text: str, reference: str) -> SheetName:
    if not sheet_text:
        raise ValueError(f'Invalid spreadsheet reference "{reference}".')
    if sheet_text.startswith("'") or sheet_text.endswith("'"):
        if not (sheet_text.startswith("'") and sheet_text.endswith("'")):
            raise ValueError(f'Invalid spreadsheet reference "{reference}".')
        inner = sheet_text[1:-1]
        if not inner or "'" in inner.replace("''", ""):
            raise ValueError(f'Invalid spreadsheet reference "{reference}".')
        return inner.replace("''", "'")
    if "'" in sheet_text:
        raise ValueError(f'Invalid spreadsheet reference "{reference}".')
    return sheet_text


def _parse_snapshot_endpoint(
    text: str, reference: str, *, allow_open: bool
) -> _SnapshotEndpoint:
    if "!" in text:
        sheet_text, address_text = text.rsplit("!", 1)
        sheet_name = _decode_snapshot_sheet_name(sheet_text, reference)
    else:
        address_text = text
        sheet_name = None
    try:
        row, column = _parse_range_endpoint(address_text)
    except ValueError as exc:
        raise ValueError(f'Invalid spreadsheet reference "{reference}".') from exc
    if not allow_open and (row is None or column is None):
        raise ValueError(f'Invalid spreadsheet reference "{reference}".')
    return _SnapshotEndpoint(sheet_name=sheet_name, row=row, column=column)


def _parse_snapshot_reference(reference: str) -> _SnapshotReference:
    if not isinstance(reference, str) or not reference:
        raise ValueError(f'Invalid spreadsheet reference "{reference}".')
    if reference.count(":") > 1:
        raise ValueError(f'Invalid spreadsheet reference "{reference}".')

    if ":" in reference:
        start_text, end_text = reference.split(":", 1)
        start = _parse_snapshot_endpoint(start_text, reference, allow_open=True)
        end = _parse_snapshot_endpoint(end_text, reference, allow_open=True)
        if (
            start.sheet_name is not None
            and end.sheet_name is not None
            and start.sheet_name != end.sheet_name
        ):
            raise ValueError(
                f'Spreadsheet range "{reference}" cannot span multiple sheets.'
            )
        if any(
            first is not None and last is not None and first > last
            for first, last in zip(start.coordinates, end.coordinates, strict=True)
        ):
            raise ValueError(
                f'Spreadsheet range "{reference}" must run from top-left to bottom-right.'
            )
        return _SnapshotReference(start=start, end=end)

    start = _parse_snapshot_endpoint(reference, reference, allow_open=False)
    return _SnapshotReference(start=start, end=None)


def _column_name(column: int) -> str:
    assert column >= 0, f"Invalid column index: {column + 1}"
    if column < len(_COLUMN_LETTERS):
        return _COLUMN_LETTERS[column]
    result = ""
    value = column + 1
    while value > 0:
        value, remainder = divmod(value - 1, 26)
        result = _COLUMN_LETTERS[remainder] + result
    return result


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class Book:
    """Read-only, spreadsheet-native view of a normalized snapshot.

    Pass the private grading configuration from ``data["correct_answers"]`` as
    ``grading`` to expose the inputs of each hidden test case.
    """

    snapshot: InitVar[Snapshot]
    grading: InitVar[Mapping[str, object] | None] = None
    _sheets: dict[SheetName, _SparseSheet] = field(init=False)
    _sheet_views: dict[SheetName, Sheet] = field(init=False)
    _grading_outputs: dict[str, Result] = field(init=False)
    _has_grading: bool = field(init=False)
    _reference: Reference | None = field(init=False)
    _student_spaces: dict[str, tuple[SheetName, AddressSpace]] | None = field(
        init=False
    )
    sheet_names: tuple[SheetName, ...] = field(init=False)
    outputs: Mapping[str, Output] = field(init=False)
    cases: tuple[Case, ...] = field(init=False)

    def __post_init__(
        self, snapshot: Snapshot, grading_config: Mapping[str, object] | None
    ) -> None:
        """Validate and index the normalized snapshot."""
        validated_snapshot = _validated_snapshot(snapshot)

        raw_sheets = validated_snapshot.get("sheets", [])
        if not isinstance(raw_sheets, list):
            raise TypeError("The spreadsheet snapshot has an invalid sheets field.")
        sheets: dict[SheetName, _SparseSheet] = {}
        normalized_sheet_names: set[str] = set()
        for raw_sheet in raw_sheets:
            if not isinstance(raw_sheet, Mapping):
                raise TypeError("The spreadsheet snapshot contains an invalid sheet.")
            name = raw_sheet.get("name")
            rows = raw_sheet.get("rows")
            columns = raw_sheet.get("columns")
            if not isinstance(name, str):
                raise TypeError("The spreadsheet snapshot contains an invalid sheet.")
            if (
                isinstance(rows, bool)
                or not isinstance(rows, int)
                or rows < 1
                or isinstance(columns, bool)
                or not isinstance(columns, int)
                or columns < 1
            ):
                raise TypeError(f'Spreadsheet sheet "{name}" has invalid dimensions.')
            normalized_sheet_name = name.casefold()
            if normalized_sheet_name in normalized_sheet_names:
                raise ValueError(f'Duplicate spreadsheet sheet "{name}".')
            normalized_sheet_names.add(normalized_sheet_name)

            visible_range = AddressRange(
                Address(row=0, column=0),
                Address(row=rows - 1, column=columns - 1),
            )

            raw_cells = raw_sheet.get("cells", {})
            if not isinstance(raw_cells, Mapping):
                raise TypeError(f'Spreadsheet sheet "{name}" has invalid cells.')
            cells: dict[str, _EvaluatedCell] = {}
            for raw_address, raw_cell in raw_cells.items():
                if not isinstance(raw_address, str) or not isinstance(raw_cell, dict):
                    raise TypeError(f'Spreadsheet sheet "{name}" has invalid cells.')
                try:
                    address, row, column = _normalized_address(raw_address)
                except ValueError as exc:
                    raise TypeError(
                        f'Spreadsheet sheet "{name}" has invalid cells.'
                    ) from exc
                if row >= rows or column >= columns:
                    raise ValueError(
                        f'Spreadsheet cell "{name}!{address}" is outside the sheet.'
                    )
                if address in cells:
                    raise ValueError(f'Duplicate spreadsheet cell "{name}!{address}".')
                context = f'Spreadsheet cell "{name}!{address}"'
                cells[address] = _EvaluatedCell(
                    input=_validated_snapshot_input(raw_cell.get("input"), context),
                    result=_validated_snapshot_result(raw_cell.get("result"), context),
                )
            sheets[name] = _SparseSheet(
                name=name,
                rows=rows,
                columns=columns,
                visible_range=visible_range,
                addressed_data=cells,
            )

        grading = validated_snapshot.get("grading")
        grading_outputs: dict[str, Result] = {}
        if grading is not None:
            if not isinstance(grading, Mapping):
                raise TypeError(
                    "The spreadsheet snapshot has invalid private grading outputs."
                )
            if grading.get("schema_version") != 2:
                raise ValueError(
                    "Spreadsheet grading outputs must use schema version 2."
                )
            raw_outputs = grading.get("outputs")
            if not isinstance(raw_outputs, Mapping):
                raise TypeError(
                    "The spreadsheet snapshot has invalid private grading outputs."
                )
            for name, result in raw_outputs.items():
                if not isinstance(name, str):
                    raise TypeError(
                        "The spreadsheet snapshot has invalid private grading outputs."
                    )
                grading_outputs[name] = _validated_snapshot_result(
                    result, f'Spreadsheet grading output "{name}"'
                )

        object.__setattr__(self, "_sheets", sheets)
        object.__setattr__(self, "_sheet_views", {})
        object.__setattr__(self, "_grading_outputs", grading_outputs)
        object.__setattr__(self, "_has_grading", grading is not None)
        object.__setattr__(self, "sheet_names", tuple(sheets))
        object.__setattr__(self, "outputs", _Outputs(self))

        cases: tuple[Case, ...] = ()
        reference: Reference | None = None
        if isinstance(grading_snapshot := validated_snapshot.get("grading"), Mapping):
            cases = _validated_cases(grading_snapshot, grading_config)
            raw_reference = grading_snapshot.get("reference")
            if raw_reference is not None:
                reference = _validated_reference(raw_reference, cases)
        object.__setattr__(self, "cases", cases)
        object.__setattr__(self, "_reference", reference)
        object.__setattr__(
            self,
            "_student_spaces",
            None if grading_config is None else _student_spaces(grading_config),
        )

    @property
    def has_reference(self) -> bool:
        """Whether the snapshot contains reference-solution comparisons."""
        return self._reference is not None

    @property
    def reference(self) -> Reference:
        """Student-versus-reference comparisons for the reference solution's cells."""
        if self._reference is None:
            raise ValueError(
                "The spreadsheet snapshot does not contain reference comparisons."
            )
        return self._reference

    def student_cell(self, source_address: str) -> Cell:
        """Return the student's cell for a sheet-qualified source address.

        Reference cells, test-case inputs, and outputs use source-workbook
        coordinates, while the student's sheets are rebased to start at ``A1``. Use
        this to find the cell a student sees for a source address, such as a key of
        :attr:`reference`. ``Book`` must be created with ``grading``.

        Returns:
            The cell view in the student's sheet.

        Raises:
            ValueError: If ``Book`` was created without ``grading``, or the address
                is outside every student range.
        """
        if self._student_spaces is None:
            raise ValueError(
                "Pass grading=data['correct_answers'][answers_name] to Book() to map source addresses."
            )
        address = QualifiedAddress.from_a1(source_address)
        try:
            student_sheet, space = self._student_spaces[address.sheet_name.casefold()]
            local = space.to_student_address(address.local)
        except (KeyError, ValueError):
            raise ValueError(
                f'Spreadsheet source cell "{source_address}" is outside every student range.'
            ) from None
        return self[student_sheet].cell(local.address)

    def _sheet_data(self, sheet_name: SheetName) -> _SparseSheet:
        try:
            return self._sheets[sheet_name]
        except KeyError:
            raise KeyError(f'Unknown spreadsheet sheet "{sheet_name}".') from None

    def _grading_output(self, name: str) -> Result:
        if not self._has_grading:
            raise KeyError(
                "The spreadsheet snapshot does not contain private grading outputs."
            )
        try:
            return self._grading_outputs[name]
        except KeyError:
            raise KeyError(f'Unknown spreadsheet grading output "{name}".') from None

    def _grading_output_names(self) -> tuple[str, ...]:
        return tuple(self._grading_outputs)

    def __getitem__(self, sheet_name: SheetName) -> Sheet:
        """Return the sheet with the given name."""
        data = self._sheet_data(sheet_name)
        if sheet_name not in self._sheet_views:
            self._sheet_views[sheet_name] = Sheet(self, data)
        return self._sheet_views[sheet_name]


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class Sheet:
    """Read-only view of one sheet in a :class:`Book`."""

    book: Book
    _cells: _SparseSheet

    @property
    def name(self) -> SheetName:
        """The sheet name."""
        return self._cells.name

    @property
    def rows(self) -> int:
        """The number of student-visible rows."""
        return self._cells.visible_range.shape[0]

    @property
    def columns(self) -> int:
        """The number of student-visible columns."""
        return self._cells.visible_range.shape[1]

    @property
    def shape(self) -> tuple[int, int]:
        """The visible sheet dimensions as ``(rows, columns)``."""
        return (self.rows, self.columns)

    def __iter__(self) -> Iterator[Cell]:
        """Iterate over visible cells in row-major order."""
        return CellRange(self, self._cells.visible_range).iter_cells()

    def _validate_address(self, address: Address) -> None:
        if address not in self._cells:
            raise ValueError(
                f'Spreadsheet cell "{self.name}!{address.address}" is outside the sheet.'
            )

    def _cell_data(self, address: Address) -> _EvaluatedCell | None:
        self._validate_address(address)
        return self._cells.addressed_data.get(address.address)

    def _validate_range(self, r: AddressRange) -> None:
        self._validate_address(r.start)
        self._validate_address(r.end)

    def __getitem__(self, reference: str) -> Cell | CellRange:
        """Resolve an A1 cell or range, such as ``"B2"``, ``"B2:D9"``, or ``"B2:B"``.

        An open-ended range extends to the edge of the sheet, like Google Sheets.

        Returns:
            A cell view for a cell reference, or a range view for a range.

        Raises:
            ValueError: If the reference is invalid or outside the sheet.
        """
        parsed = _parse_snapshot_reference(reference)
        target_sheet_name = parsed.start.sheet_name or self.name
        target_sheet = self.book[target_sheet_name]
        if parsed.end is None:
            return Cell(target_sheet, parsed.start.to_address().local_address)
        end_sheet_name = parsed.end.sheet_name or target_sheet_name
        if end_sheet_name != target_sheet.name:
            raise ValueError(
                f'Spreadsheet range "{reference}" cannot span multiple sheets.'
            )
        start = parsed.start.coordinates
        end = parsed.end.coordinates
        if None not in (*start, *end):
            # Closed ranges keep their endpoints so that out-of-sheet ranges are
            # reported against the sheet rather than as unresolvable.
            return CellRange(
                target_sheet,
                AddressRange(
                    parsed.start.to_address().local_address,
                    parsed.end.to_address().local_address,
                ),
            )
        return CellRange(
            target_sheet,
            _resolve_range_endpoints(
                start, end, target_sheet._cells.visible_range, reference
            ),
        )

    def cell(self, reference: str) -> Cell:
        """Resolve an A1 cell reference."""
        cell = self[reference]
        if not isinstance(cell, Cell):
            raise TypeError(f'Spreadsheet reference "{reference}" is not a cell.')
        return cell

    def range(self, reference: str) -> CellRange:
        """Resolve an A1 range reference, which may be open-ended like ``"B2:B"``."""
        cell_range = self[reference]
        if not isinstance(cell_range, CellRange):
            raise TypeError(f'Spreadsheet reference "{reference}" is not a range.')
        return cell_range

    def query(
        self,
        predicate: Callable[[Cell], bool],
        *,
        include_empty: bool = False,
    ) -> tuple[Cell, ...]:
        """Return visible cells that satisfy a predicate in row-major order."""
        sheet_range = CellRange(self, self._cells.visible_range)
        return sheet_range.query(predicate, include_empty=include_empty)


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class Cell:
    """Read-only view of one in-bounds cell in a spreadsheet snapshot."""

    sheet: Sheet
    _location: Address
    _cell: _EvaluatedCell | None = field(init=False)

    def __post_init__(self) -> None:
        """Validate the address and cache the cell's derived metadata."""
        cell = self.sheet._cell_data(self._location)
        object.__setattr__(self, "_cell", cell)

    @property
    def row(self) -> int:
        """The one-based row number."""
        return self._location.row + 1

    @property
    def column(self) -> str:
        """The column name."""
        return _column_name(self._location.column)

    @property
    def address(self) -> str:
        """The unqualified A1 address."""
        return self._location.address

    @property
    def qualified_address(self) -> str:
        """The sheet-qualified A1 address."""
        return str(QualifiedAddress(self._location, self.sheet.name))

    @property
    def formula(self) -> str | None:
        """The cell formula, or ``None`` for a literal or empty cell."""
        if self._cell is None or self._cell.input["type"] != "formula":
            return None
        return self._cell.input["value"]

    @property
    def is_empty(self) -> bool:
        """Whether the calculated result is empty."""
        return self._cell is None or self._cell.result["type"] == "empty"

    @property
    def is_formula(self) -> bool:
        """Whether the cell input is a formula."""
        return self.formula is not None

    @property
    def is_error(self) -> bool:
        """Whether calculation produced a spreadsheet error."""
        return self._cell is not None and self._cell.result["type"] == "error"

    @property
    def error_type(self) -> str | None:
        """The calculation engine's error type, if present."""
        result = self.result
        return result["error_type"] if result["type"] == "error" else None

    @property
    def error_value(self) -> str | None:
        """The displayed spreadsheet error value, if present."""
        result = self.result
        return result["value"] if result["type"] == "error" else None

    @property
    def input(self) -> Input | None:
        """A copy of the typed input, or ``None`` for an empty cell."""
        if self._cell is None:
            return None
        return self._cell.input.copy()

    @property
    def result(self) -> Result:
        """A copy of the authoritative typed calculation result."""
        if self._cell is None:
            return {"type": "empty"}
        return self._cell.result.copy()

    @property
    def value(self) -> Value:
        """The plain calculated value, or ``None`` for empty and error results."""
        return _spreadsheet_result_value(self.result)

    @property
    def formula_ast(self) -> FormulaAst | None:
        """The parsed formula AST, or ``None`` when the cell is not a formula."""
        return None if self.formula is None else parse_spreadsheet_formula(self.formula)

    def matches_formula(self, expected: str, *, structural: bool = False) -> bool:
        """Return whether the formula matches textually or structurally."""
        formula = self.formula
        if not structural:
            return formula is not None and formula == expected
        expected_root = parse_spreadsheet_formula(expected).root
        if formula is None:
            return False
        try:
            actual_root = parse_spreadsheet_formula(formula).root
        except FormulaParseError:
            return False
        return actual_root == expected_root

    def __str__(self) -> str:
        """Return a human-readable representation of the calculated value."""
        if self.is_empty:
            return ""
        if err := self.error_value:
            return f"#ERROR({err!r})"
        return str(self.value)


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class CellRange:
    """Read-only rectangular cell range on one sheet."""

    sheet: Sheet
    _range: AddressRange

    def __post_init__(self) -> None:
        """Validate the range endpoints."""
        self.sheet._validate_range(self._range)

    @property
    def range_address(self) -> str:
        """The unqualified A1 range."""
        return str(self._range)

    @property
    def qualified_range_address(self) -> str:
        """The sheet-qualified A1 range."""
        return str(QualifiedAddressRange(self._range, self.sheet.name))

    @property
    def shape(self) -> tuple[int, int]:
        """The range dimensions as ``(rows, columns)``."""
        return self._range.shape

    @property
    def cells(self) -> tuple[tuple[Cell, ...], ...]:
        """The cells as an immutable row-major matrix."""
        return tuple(
            tuple(
                Cell(self.sheet, Address(row, column))
                for column in range(
                    self._range.start.column, self._range.end.column + 1
                )
            )
            for row in range(self._range.start.row, self._range.end.row + 1)
        )

    @property
    def inputs(self) -> tuple[tuple[Input | None, ...], ...]:
        """Typed cell inputs as an immutable row-major matrix."""
        return tuple(tuple(cell.input for cell in row) for row in self.cells)

    @property
    def results(self) -> tuple[tuple[Result, ...], ...]:
        """Typed calculation results as an immutable row-major matrix."""
        return tuple(tuple(cell.result for cell in row) for row in self.cells)

    @property
    def values(
        self,
    ) -> tuple[tuple[Value, ...], ...]:
        """Plain calculated values as an immutable row-major matrix."""
        return tuple(tuple(cell.value for cell in row) for row in self.cells)

    @property
    def formulas(self) -> tuple[tuple[str | None, ...], ...]:
        """Formulas as an immutable row-major matrix."""
        return tuple(tuple(cell.formula for cell in row) for row in self.cells)

    def iter_cells(self, *, include_empty: bool = True) -> Iterator[Cell]:
        """Iterate over cells in row-major order, optionally skipping empty cells."""
        for row in self.cells:
            for cell in row:
                if include_empty or not cell.is_empty:
                    yield cell

    def query(
        self,
        predicate: Callable[[Cell], bool],
        *,
        include_empty: bool = False,
    ) -> tuple[Cell, ...]:
        """Return cells that satisfy a predicate in row-major order."""
        return tuple(
            cell
            for cell in self.iter_cells(include_empty=include_empty)
            if predicate(cell)
        )

    def __getitem__(self, reference: str) -> Cell:
        """Return a cell within this range."""
        parsed = _parse_snapshot_reference(reference)
        if parsed.end is not None:
            raise ValueError("Spreadsheet ranges can only be indexed by a single cell.")
        address = parsed.start.to_address()
        if address not in QualifiedAddressRange(self._range, self.sheet.name):
            raise ValueError(
                f'Spreadsheet cell "{reference}" is outside range "{self.qualified_range_address}".'
            )
        return Cell(self.sheet, address.local_address)


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class Output:
    """Read-only view of a named private grading output."""

    _spreadsheet: Book
    name: str

    @property
    def _result(self) -> Result:
        return self._spreadsheet._grading_output(self.name)

    @property
    def is_empty(self) -> bool:
        """Whether the grading output is empty."""
        return self._result["type"] == "empty"

    @property
    def is_error(self) -> bool:
        """Whether the grading output is a spreadsheet error."""
        return self._result["type"] == "error"

    @property
    def error_type(self) -> str | None:
        """The calculation engine's error type, if present."""
        return self._result["error_type"] if self._result["type"] == "error" else None

    @property
    def error_value(self) -> str | None:
        """The displayed spreadsheet error value, if present."""
        return self._result["value"] if self._result["type"] == "error" else None

    @property
    def result(self) -> Result:
        """A copy of the authoritative typed grading result."""
        return self._result.copy()

    @property
    def value(self) -> Value:
        """The plain value, or ``None`` for empty and error results."""
        return _spreadsheet_result_value(self.result)


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class _Outputs(Mapping[str, Output]):
    """Read-only mapping view of private grading outputs."""

    _spreadsheet: Book

    def __getitem__(self, name: str) -> Output:
        """Return a named private grading output."""
        self._spreadsheet._grading_output(name)
        return Output(self._spreadsheet, name)

    def __iter__(self) -> Iterator[str]:
        """Iterate over private grading output names."""
        return iter(self._spreadsheet._grading_output_names())

    def __len__(self) -> int:
        """Return the number of private grading outputs."""
        return len(self._spreadsheet._grading_output_names())


def _comparison_key(address: str) -> str:
    if "!" not in address:
        raise KeyError(
            f'Spreadsheet reference address "{address}" must be sheet-qualified, such as "Inputs!D2".'
        )
    sheet_text, local_text = address.rsplit("!", 1)
    try:
        sheet_name = QualifiedAddress.from_a1(f"{sheet_text}!A1").sheet_name
        local = Address.from_a1(local_text)
    except ValueError:
        raise KeyError(f'Invalid spreadsheet reference address "{address}".') from None
    return f"{sheet_name}!{local}"


@dataclass(frozen=True, slots=True)
class Case:
    """Private grading outputs recomputed for one hidden test case."""

    name: str
    outputs: Mapping[str, Result]
    inputs: Mapping[str, SourceValue | None] | None
    """Overridden cells keyed by source address, or ``None`` when ``Book`` was
    created without the private grading configuration."""

    def value(self, output_name: str) -> Value:
        """Return the plain value of a named output in this case."""
        return _spreadsheet_result_value(self.outputs[output_name])


@dataclass(frozen=True, slots=True)
class Comparison:
    """Student and reference results for one cell or output in one run."""

    student: Result
    reference: Result
    match: bool
    case: Case | None
    """The hidden test case, or ``None`` for the student's submitted inputs."""

    @property
    def student_value(self) -> Value:
        """The student's plain value, or ``None`` for empty and error results."""
        return _spreadsheet_result_value(self.student)

    @property
    def reference_value(self) -> Value:
        """The reference plain value, or ``None`` for empty and error results."""
        return _spreadsheet_result_value(self.reference)


@dataclass(frozen=True, slots=True)
class ComparisonSeries:
    """Comparisons for the submitted inputs followed by every hidden test case."""

    base: Comparison
    cases: tuple[Comparison, ...]

    @property
    def comparisons(self) -> tuple[Comparison, ...]:
        """The base comparison followed by every test-case comparison."""
        return (self.base, *self.cases)

    @property
    def all_match(self) -> bool:
        """Whether the student matches the reference in every run."""
        return all(comparison.match for comparison in self.comparisons)

    @property
    def match_rate(self) -> float:
        """The fraction of runs in which the student matches the reference."""
        comparisons = self.comparisons
        return sum(comparison.match for comparison in comparisons) / len(comparisons)

    @property
    def first_mismatch(self) -> Comparison | None:
        """The first run in which the student differs from the reference."""
        return next(
            (comparison for comparison in self.comparisons if not comparison.match),
            None,
        )


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class Reference(Mapping[str, ComparisonSeries]):
    """Reference-solution comparisons keyed by source-coordinate cell address."""

    _cells: dict[str, ComparisonSeries]
    outputs: Mapping[str, ComparisonSeries]
    """Comparisons of named outputs, when the author enabled ``compare_outputs``."""
    matched: int
    total: int

    def __getitem__(self, address: str) -> ComparisonSeries:
        """Return the comparisons for a sheet-qualified reference cell."""
        key = _comparison_key(address)
        try:
            return self._cells[key]
        except KeyError:
            raise KeyError(
                f'"{address}" is not a spreadsheet reference cell.'
            ) from None

    def __iter__(self) -> Iterator[str]:
        """Iterate over reference cell addresses."""
        return iter(self._cells)

    def __len__(self) -> int:
        """Return the number of reference cells."""
        return len(self._cells)

    def score(self) -> float:
        """Return the fraction of all comparisons that match, from 0 to 1."""
        return self.matched / self.total if self.total else 0.0

    def cell_score(self) -> float:
        """Return the fraction of reference cells that match in every run, from 0 to 1."""
        if not self._cells:
            return 0.0
        return sum(series.all_match for series in self._cells.values()) / len(
            self._cells
        )


def _student_spaces(
    grading: Mapping[str, object],
) -> dict[str, tuple[SheetName, AddressSpace]]:
    raw_overlays = grading.get("student_overlays", [])
    if not isinstance(raw_overlays, list):
        raise TypeError("The private spreadsheet student overlays are invalid.")
    spaces: dict[str, tuple[SheetName, AddressSpace]] = {}
    for raw_overlay in raw_overlays:
        if not isinstance(raw_overlay, Mapping):
            raise TypeError("The private spreadsheet student overlays are invalid.")
        source_sheet = raw_overlay.get("source_sheet")
        student_sheet = raw_overlay.get("student_sheet")
        source_range = raw_overlay.get("source_range")
        if not (
            isinstance(source_sheet, str)
            and isinstance(student_sheet, str)
            and isinstance(source_range, str)
        ):
            raise TypeError("The private spreadsheet student overlays are invalid.")
        spaces[source_sheet.casefold()] = (
            student_sheet,
            AddressSpace.from_source_range(source_range),
        )
    return spaces


def _private_case_inputs(
    grading: Mapping[str, object], grader_hash: object
) -> list[dict[str, SourceValue | None]]:
    if grading.get("grader_hash") != grader_hash:
        raise ValueError(
            "The private spreadsheet grading configuration does not match this snapshot."
        )
    raw_cases = grading.get("test_cases", [])
    if not isinstance(raw_cases, list):
        raise TypeError("The private spreadsheet test cases are invalid.")
    case_inputs: list[dict[str, SourceValue | None]] = []
    for raw_case in raw_cases:
        if not isinstance(raw_case, Mapping) or not isinstance(
            raw_inputs := raw_case.get("inputs"), list
        ):
            raise TypeError("The private spreadsheet test cases are invalid.")
        inputs: dict[str, SourceValue | None] = {}
        for raw_input in raw_inputs:
            if not isinstance(raw_input, Mapping):
                raise TypeError("The private spreadsheet test cases are invalid.")
            value = raw_input.get("value")
            if value is not None and not isinstance(value, bool | int | float | str):
                raise TypeError("The private spreadsheet test cases are invalid.")
            inputs[f"{raw_input.get('sheet')}!{raw_input.get('cell')}"] = value
        case_inputs.append(inputs)
    return case_inputs


def _validated_cases(
    grading_snapshot: Mapping[str, object], grading: Mapping[str, object] | None
) -> tuple[Case, ...]:
    raw_cases = grading_snapshot.get("cases", [])
    if not isinstance(raw_cases, list):
        raise TypeError("The spreadsheet snapshot has invalid test cases.")
    case_inputs = (
        None
        if grading is None
        else _private_case_inputs(grading, grading_snapshot.get("grader_hash"))
    )
    if case_inputs is not None and len(case_inputs) != len(raw_cases):
        raise ValueError(
            "The private spreadsheet grading configuration does not match this snapshot."
        )
    cases: list[Case] = []
    for index, raw_case in enumerate(raw_cases):
        if not isinstance(raw_case, Mapping):
            raise TypeError("The spreadsheet snapshot has invalid test cases.")
        name = raw_case.get("name")
        raw_outputs = raw_case.get("outputs")
        if not isinstance(name, str) or not isinstance(raw_outputs, Mapping):
            raise TypeError("The spreadsheet snapshot has invalid test cases.")
        outputs = {
            str(output_name): _validated_snapshot_result(
                result, f'Spreadsheet test case "{name}" output "{output_name}"'
            )
            for output_name, result in raw_outputs.items()
        }
        cases.append(
            Case(
                name=name,
                outputs=outputs,
                inputs=None if case_inputs is None else case_inputs[index],
            )
        )
    return tuple(cases)


def _validated_comparison_series(
    value: object, cases: tuple[Case, ...], context: str
) -> ComparisonSeries:
    if not isinstance(value, Mapping) or not isinstance(
        raw_cases := value.get("cases"), list
    ):
        raise TypeError(f"{context} has invalid reference comparisons.")
    if len(raw_cases) != len(cases):
        raise ValueError(f"{context} does not have one comparison per test case.")

    def comparison(raw: object, case: Case | None) -> Comparison:
        if not isinstance(raw, Mapping) or not isinstance(
            match := raw.get("match"), bool
        ):
            raise TypeError(f"{context} has invalid reference comparisons.")
        return Comparison(
            student=_validated_snapshot_result(raw.get("student"), context),
            reference=_validated_snapshot_result(raw.get("reference"), context),
            match=match,
            case=case,
        )

    return ComparisonSeries(
        base=comparison(value.get("base"), None),
        cases=tuple(
            comparison(raw, case) for raw, case in zip(raw_cases, cases, strict=True)
        ),
    )


def _validated_reference(value: object, cases: tuple[Case, ...]) -> Reference:
    if not isinstance(value, Mapping):
        raise TypeError("The spreadsheet snapshot has invalid reference comparisons.")
    raw_cells = value.get("cells")
    raw_outputs = value.get("outputs", {})
    summary = value.get("summary")
    if (
        not isinstance(raw_cells, Mapping)
        or not isinstance(raw_outputs, Mapping)
        or not isinstance(summary, Mapping)
    ):
        raise TypeError("The spreadsheet snapshot has invalid reference comparisons.")
    matched = summary.get("matched")
    total = summary.get("total")
    if (
        isinstance(matched, bool)
        or not isinstance(matched, int)
        or isinstance(total, bool)
        or not isinstance(total, int)
    ):
        raise TypeError("The spreadsheet snapshot has an invalid reference summary.")
    return Reference(
        _cells={
            str(address): _validated_comparison_series(
                series, cases, f'Spreadsheet reference cell "{address}"'
            )
            for address, series in raw_cells.items()
        },
        outputs={
            str(name): _validated_comparison_series(
                series, cases, f'Spreadsheet reference output "{name}"'
            )
            for name, series in raw_outputs.items()
        },
        matched=matched,
        total=total,
    )


def _reference_score_and_feedback(book: Book) -> tuple[float, str]:
    reference = book.reference
    score = reference.cell_score()
    if score == 1:
        if book.cases:
            return score, (
                "All answer cells match the reference solution on your worksheet and "
                "on every hidden test case."
            )
        return score, "All answer cells match the reference solution."

    passed = sum(series.all_match for series in reference.values())
    feedback = (
        f"{passed} of {len(reference)} answer cells match the reference solution."
    )
    address, mismatch = next(
        (address, series.first_mismatch)
        for address, series in reference.items()
        if series.first_mismatch is not None
    )
    cell = book.student_cell(address)
    location = cell.qualified_address if len(book.sheet_names) > 1 else cell.address
    if mismatch.case is None:
        feedback += f" For example, {location} does not calculate the expected value."
    elif cell.is_formula:
        feedback += (
            f" For example, {location} is correct for the values shown but not for "
            "every hidden test case. Check that the formula works for other data too."
        )
    else:
        feedback += (
            f" For example, {location} is correct for the values shown but not when "
            "the hidden test cases change the data. Use a formula that refers to the "
            "data cells rather than a typed value."
        )
    return score, feedback


def grade_reference(data: QuestionData, answers_name: str, *, weight: int = 1) -> None:
    """Grade a ``pl-spreadsheet`` answer against its reference solution.

    Call this from a question's ``grade()`` function. Each reference cell earns equal
    credit when it matches the reference on the submitted inputs and on every hidden
    test case. The feedback names the first mismatching cell in the student's
    coordinates and suggests whether a typed value or a formula that does not
    generalize is the cause. ``pl-spreadsheet`` shows the feedback with the
    submission. The question score is then recomputed from all partial scores.
    """
    grading = data["correct_answers"][answers_name]
    grade_answer_parameterized(
        data,
        answers_name,
        lambda submission: _reference_score_and_feedback(
            Book(submission, grading=grading)
        ),
        weight=weight,
    )
    set_weighted_score_data(data)
