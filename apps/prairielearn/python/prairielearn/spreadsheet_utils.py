"""Utilities for grading normalized ``pl-spreadsheet`` submissions."""

from __future__ import annotations

import datetime
import math
import numbers
import re
import string
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import InitVar, dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal, NotRequired, Protocol, TypedDict, cast

import numpy as np
import pandas as pd
from openpyxl.formula import Tokenizer

if TYPE_CHECKING:
    import os

SPREADSHEET_FORMULA_AST_VERSION = 1
_COLUMN_LETTERS = string.ascii_uppercase

type SheetName = str

__all__ = [
    "SPREADSHEET_FORMULA_AST_VERSION",
    "Address",
    "AddressRange",
    "AddressSpace",
    "AddressSpaceMap",
    "Book",
    "BooleanInput",
    "BooleanResult",
    "Cell",
    "CellRange",
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
    "Input",
    "NumberInput",
    "NumberResult",
    "Output",
    "QualifiedAddress",
    "QualifiedAddressRange",
    "Result",
    "Sheet",
    "SheetName",
    "Snapshot",
    "SnapshotCell",
    "SnapshotEngine",
    "SnapshotGrading",
    "SnapshotSheet",
    "SourceBook",
    "SourceSheet",
    "SourceValue",
    "StringInput",
    "StringResult",
    "Value",
    "dataframe_to_spreadsheet_sheet",
    "dataframes_to_spreadsheet_book",
    "get_spreadsheet_cell",
    "get_spreadsheet_formula",
    "get_spreadsheet_formula_ast",
    "get_spreadsheet_grading_output",
    "get_spreadsheet_result",
    "get_spreadsheet_value",
    "parse_spreadsheet_formula",
    "read_spreadsheet",
    "read_spreadsheet_csv",
    "read_spreadsheet_tsv",
    "read_spreadsheet_xlsx",
    "rebase_spreadsheet_formula",
]


class NumberInput(TypedDict):
    type: Literal["number"]
    value: int | float


class StringInput(TypedDict):
    type: Literal["string"]
    value: str


class BooleanInput(TypedDict):
    type: Literal["boolean"]
    value: bool


class FormulaInput(TypedDict):
    type: Literal["formula"]
    value: str


type Input = NumberInput | StringInput | BooleanInput | FormulaInput


class EmptyResult(TypedDict):
    type: Literal["empty"]


class NumberResult(TypedDict):
    type: Literal["number"]
    value: int | float


class StringResult(TypedDict):
    type: Literal["string"]
    value: str


class BooleanResult(TypedDict):
    type: Literal["boolean"]
    value: bool


class ErrorResult(TypedDict):
    type: Literal["error"]
    value: str
    error_type: str


type Result = EmptyResult | NumberResult | StringResult | BooleanResult | ErrorResult

type Value = bool | int | float | str | None


def _spreadsheet_result_value(result: Result) -> Value:
    if result["type"] == "empty":
        return None
    if result["type"] == "error":
        return None
    return result["value"]


class SnapshotCell(TypedDict):
    input: Input
    result: Result


class SnapshotEngine(TypedDict):
    name: Literal["hyperformula"]
    version: str
    configuration_version: int


class SnapshotSheet(TypedDict):
    name: SheetName
    rows: int
    columns: int
    cells: dict[str, SnapshotCell]


class SnapshotGrading(TypedDict):
    schema_version: Literal[2]
    grader_hash: str
    outputs: dict[str, Result]


class Snapshot(TypedDict):
    schema_version: Literal[2]
    template_hash: str
    engine: SnapshotEngine
    sheets: list[SnapshotSheet]
    grading: NotRequired[SnapshotGrading]


@dataclass(frozen=True, slots=True)
class FormulaCellReference:
    sheet: SheetName | None
    column: str
    row: int
    column_absolute: bool
    row_absolute: bool
    kind: Literal["cell"] = field(default="cell", init=False)


@dataclass(frozen=True, slots=True)
class FormulaColumnReference:
    sheet: SheetName | None
    column: str
    column_absolute: bool
    kind: Literal["column"] = field(default="column", init=False)


@dataclass(frozen=True, slots=True)
class FormulaRowReference:
    sheet: SheetName | None
    row: int
    row_absolute: bool
    kind: Literal["row"] = field(default="row", init=False)


type FormulaReferenceEndpoint = (
    FormulaCellReference | FormulaColumnReference | FormulaRowReference
)


@dataclass(frozen=True, slots=True)
class FormulaLiteralNode:
    value_type: Literal["number", "string", "boolean", "error"]
    value: bool | int | float | str
    type: Literal["literal"] = field(default="literal", init=False)


@dataclass(frozen=True, slots=True)
class FormulaReferenceNode:
    reference: FormulaReferenceEndpoint
    type: Literal["reference"] = field(default="reference", init=False)


@dataclass(frozen=True, slots=True)
class FormulaCellRangeNode:
    start: FormulaCellReference
    end: FormulaCellReference
    type: Literal["range"] = field(default="range", init=False)


@dataclass(frozen=True, slots=True)
class FormulaColumnRangeNode:
    start: FormulaColumnReference
    end: FormulaColumnReference
    type: Literal["range"] = field(default="range", init=False)


@dataclass(frozen=True, slots=True)
class FormulaRowRangeNode:
    start: FormulaRowReference
    end: FormulaRowReference
    type: Literal["range"] = field(default="range", init=False)


type FormulaRangeNode = (
    FormulaCellRangeNode | FormulaColumnRangeNode | FormulaRowRangeNode
)


@dataclass(frozen=True, slots=True)
class FormulaFunctionNode:
    name: str
    arguments: tuple[FormulaAstNode, ...]
    type: Literal["function"] = field(default="function", init=False)


@dataclass(frozen=True, slots=True)
class FormulaUnaryNode:
    operator: Literal["+", "-"]
    operand: FormulaAstNode
    type: Literal["unary"] = field(default="unary", init=False)


@dataclass(frozen=True, slots=True)
class FormulaPostfixNode:
    operator: Literal["%"]
    operand: FormulaAstNode
    type: Literal["postfix"] = field(default="postfix", init=False)


type _FormulaBinaryOperator = Literal[
    "+", "-", "*", "/", "^", "&", "=", "<>", "<", ">", "<=", ">="
]


@dataclass(frozen=True, slots=True)
class FormulaBinaryNode:
    operator: _FormulaBinaryOperator
    left: FormulaAstNode
    right: FormulaAstNode
    type: Literal["binary"] = field(default="binary", init=False)


@dataclass(frozen=True, slots=True)
class FormulaGroupNode:
    expression: FormulaAstNode
    type: Literal["group"] = field(default="group", init=False)


@dataclass(frozen=True, slots=True)
class FormulaEmptyNode:
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


@dataclass(frozen=True, slots=True)
class FormulaAst:
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
        return f"{_column_name(self.column)}{self.row + 1}"

    @property
    def local_address(self) -> Address:
        return self

    @property
    def sheet_name(self) -> None:
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

    @property
    def address(self) -> str:
        name = _safe_sheet_name(self.sheet_name)
        return f"{name}!{self.local}"

    @property
    def local_address(self) -> Address:
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
    def from_a1(cls, range_text: str) -> AddressRange:
        """Parse and normalize an unqualified A1 cell or range reference."""
        parts = range_text.split(":")
        if len(parts) not in {1, 2}:
            raise ValueError(f'Invalid spreadsheet range "{range_text}".')
        start = Address.from_a1(parts[0])
        end = Address.from_a1(parts[-1])
        return cls(
            Address(row=min(start.row, end.row), column=min(start.column, end.column)),
            Address(row=max(start.row, end.row), column=max(start.column, end.column)),
        )

    def __post_init__(self) -> None:
        """Validate that the range runs from top-left to bottom-right."""
        if self.start.row > self.end.row or self.start.column > self.end.column:
            raise ValueError(
                f'Spreadsheet range "{self}" must run from top-left to bottom-right.'
            )

    @property
    def address(self) -> str:
        return str(self)

    @property
    def start_row(self) -> int:
        return self.start.row

    @property
    def end_row(self) -> int:
        return self.end.row

    @property
    def start_column(self) -> int:
        return self.start.column

    @property
    def end_column(self) -> int:
        return self.end.column

    @property
    def shape(self) -> tuple[int, int]:
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
        return Address(row=row, column=column) in self

    def contains_range(self, other: AddressRange) -> bool:
        return other in self

    def intersection(self, other: _Range) -> AddressRange | None:
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
        return self.source_range.shape

    @property
    def student_range(self) -> AddressRange:
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
            source = AddressRange.from_a1(source)
        return AddressRange(
            self.to_student_address(source.start),
            self.to_student_address(source.end),
        )

    def to_source_range(self, student: str | AddressRange) -> AddressRange:
        """Translate a bounded student range into the source coordinate space."""
        if isinstance(student, str):
            student = AddressRange.from_a1(student)
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


@dataclass(frozen=True, slots=True)
class QualifiedAddressRange:
    """Rectangular cell range qualified by its sheet name."""

    local: AddressRange
    sheet_name: SheetName

    @property
    def shape(self) -> tuple[int, int]:
        return self.local.shape

    def __contains__(self, ref: _Address | _Range) -> bool:
        """Return whether an address or range is contained on this sheet."""
        if isinstance(ref, QualifiedAddress | QualifiedAddressRange):
            return ref.sheet_name == self.sheet_name and ref.local in self.local
        return ref in self.local

    def intersection(self, other: _Range) -> QualifiedAddressRange | None:
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
        name = _safe_sheet_name(self.sheet_name)
        return f"{name}!{self.local}"

    def __str__(self) -> str:
        """Return the sheet-qualified A1 range."""
        return self.address


type _Range = AddressRange | QualifiedAddressRange

type SourceValue = bool | int | float | str


class SourceSheet(TypedDict):
    name: str
    rows: int
    columns: int
    cells: dict[str, SourceValue]
    editable_ranges: NotRequired[list[str]]
    student_range: NotRequired[str]


class SourceBook(TypedDict):
    schema_version: Literal[2]
    sheets: list[SourceSheet]


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
class _SnapshotReference:
    """Parsed cell or range reference from a spreadsheet snapshot."""

    start: _Address
    end: _Address | None


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


def _parse_snapshot_endpoint(text: str, reference: str) -> _Address:
    if "!" in text:
        sheet_text, address_text = text.rsplit("!", 1)
        sheet_name = _decode_snapshot_sheet_name(sheet_text, reference)
    else:
        address_text = text
        sheet_name = None
    try:
        _, row, column = _normalized_address(address_text)
    except ValueError as exc:
        raise ValueError(f'Invalid spreadsheet reference "{reference}".') from exc
    local = Address(row=row, column=column)
    if sheet_name is not None:
        return QualifiedAddress(local=local, sheet_name=sheet_name)
    return local


def _parse_snapshot_reference(reference: str) -> _SnapshotReference:
    if not isinstance(reference, str) or not reference:
        raise ValueError(f'Invalid spreadsheet reference "{reference}".')
    if reference.count(":") > 1:
        raise ValueError(f'Invalid spreadsheet reference "{reference}".')

    if ":" in reference:
        start_text, end_text = reference.split(":", 1)
        start = _parse_snapshot_endpoint(start_text, reference)
        end = _parse_snapshot_endpoint(end_text, reference)
        if (
            start.sheet_name is not None
            and end.sheet_name is not None
            and start.sheet_name != end.sheet_name
        ):
            raise ValueError(
                f'Spreadsheet range "{reference}" cannot span multiple sheets.'
            )
        start_local = start.local_address
        end_local = end.local_address
        if start_local.row > end_local.row or start_local.column > end_local.column:
            raise ValueError(
                f'Spreadsheet range "{reference}" must run from top-left to bottom-right.'
            )
        return _SnapshotReference(start=start, end=end)

    start = _parse_snapshot_endpoint(reference, reference)
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
    """Read-only, spreadsheet-native view of a normalized snapshot."""

    snapshot: InitVar[Snapshot]
    _sheets: dict[SheetName, _SparseSheet] = field(init=False)
    _sheet_views: dict[SheetName, Sheet] = field(init=False)
    _grading_outputs: dict[str, Result] = field(init=False)
    _has_grading: bool = field(init=False)
    sheet_names: tuple[SheetName, ...] = field(init=False)
    outputs: Mapping[str, Output] = field(init=False)

    def __post_init__(self, snapshot: Snapshot) -> None:
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
        return self._cells.name

    @property
    def rows(self) -> int:
        return self._cells.visible_range.shape[0]

    @property
    def columns(self) -> int:
        return self._cells.visible_range.shape[1]

    @property
    def shape(self) -> tuple[int, int]:
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
        """Resolve an A1 cell or range reference."""
        parsed = _parse_snapshot_reference(reference)
        target_sheet_name = parsed.start.sheet_name or self.name
        target_sheet = self.book[target_sheet_name]
        start = parsed.start.local_address
        if parsed.end is None:
            return Cell(target_sheet, start)
        end_sheet_name = parsed.end.sheet_name or target_sheet_name
        if end_sheet_name != target_sheet.name:
            raise ValueError(
                f'Spreadsheet range "{reference}" cannot span multiple sheets.'
            )
        return CellRange(target_sheet, AddressRange(start, parsed.end.local_address))

    def cell(self, reference: str) -> Cell:
        """Resolve an A1 cell reference."""
        cell = self[reference]
        if not isinstance(cell, Cell):
            raise TypeError(f'Spreadsheet reference "{reference}" is not a cell.')
        return cell

    def range(self, reference: str) -> CellRange:
        """Resolve an A1 range reference."""
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
        return self._location.row + 1

    @property
    def column(self) -> str:
        return _column_name(self._location.column)

    @property
    def address(self) -> str:
        return self._location.address

    @property
    def qualified_address(self) -> str:
        return str(QualifiedAddress(self._location, self.sheet.name))

    @property
    def formula(self) -> str | None:
        if self._cell is None or self._cell.input["type"] != "formula":
            return None
        return self._cell.input["value"]

    @property
    def is_empty(self) -> bool:
        return self._cell is None or self._cell.result["type"] == "empty"

    @property
    def is_formula(self) -> bool:
        return self.formula is not None

    @property
    def is_error(self) -> bool:
        return self._cell is not None and self._cell.result["type"] == "error"

    @property
    def error_type(self) -> str | None:
        result = self.result
        return result["error_type"] if result["type"] == "error" else None

    @property
    def error_value(self) -> str | None:
        result = self.result
        return result["value"] if result["type"] == "error" else None

    @property
    def input(self) -> Input | None:
        if self._cell is None:
            return None
        return self._cell.input.copy()

    @property
    def result(self) -> Result:
        if self._cell is None:
            return {"type": "empty"}
        return self._cell.result.copy()

    @property
    def value(self) -> Value:
        return _spreadsheet_result_value(self.result)

    @property
    def formula_ast(self) -> FormulaAst | None:
        return None if self.formula is None else parse_spreadsheet_formula(self.formula)

    def matches_formula(self, expected: str, *, structural: bool = False) -> bool:
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
        return str(self._range)

    @property
    def qualified_range_address(self) -> str:
        return str(QualifiedAddressRange(self._range, self.sheet.name))

    @property
    def shape(self) -> tuple[int, int]:
        return self._range.shape

    @property
    def cells(self) -> tuple[tuple[Cell, ...], ...]:
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
        return tuple(tuple(cell.input for cell in row) for row in self.cells)

    @property
    def results(self) -> tuple[tuple[Result, ...], ...]:
        return tuple(tuple(cell.result for cell in row) for row in self.cells)

    @property
    def values(
        self,
    ) -> tuple[tuple[Value, ...], ...]:
        return tuple(tuple(cell.value for cell in row) for row in self.cells)

    @property
    def formulas(self) -> tuple[tuple[str | None, ...], ...]:
        return tuple(tuple(cell.formula for cell in row) for row in self.cells)

    def iter_cells(self, *, include_empty: bool = True) -> Iterator[Cell]:
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
        if parsed.start not in QualifiedAddressRange(self._range, self.sheet.name):
            raise ValueError(
                f'Spreadsheet cell "{reference}" is outside range "{self.qualified_range_address}".'
            )
        return Cell(self.sheet, parsed.start.local_address)


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
        return self._result["type"] == "empty"

    @property
    def is_error(self) -> bool:
        return self._result["type"] == "error"

    @property
    def error_type(self) -> str | None:
        return self._result["error_type"] if self._result["type"] == "error" else None

    @property
    def error_value(self) -> str | None:
        return self._result["value"] if self._result["type"] == "error" else None

    @property
    def result(self) -> Result:
        return self._result.copy()

    @property
    def value(self) -> Value:
        return _spreadsheet_result_value(self.result)


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class _Outputs(Mapping[str, Output]):
    """Read-only mapping view of private grading outputs."""

    _spreadsheet: Book

    def __getitem__(self, name: str) -> Output:
        self._spreadsheet._grading_output(name)
        return Output(self._spreadsheet, name)

    def __iter__(self) -> Iterator[str]:
        return iter(self._spreadsheet._grading_output_names())

    def __len__(self) -> int:
        return len(self._spreadsheet._grading_output_names())
