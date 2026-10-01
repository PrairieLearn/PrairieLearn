"""Utilities for grading normalized ``pl-spreadsheet`` submissions."""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, field
from typing import Literal, Protocol, TypedDict, cast

from openpyxl.formula import Tokenizer

SPREADSHEET_FORMULA_AST_VERSION = 1

__all__ = [
    "SPREADSHEET_FORMULA_AST_VERSION",
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
    "FormulaLiteralNode",
    "FormulaPostfixNode",
    "FormulaRangeNode",
    "FormulaReferenceEndpoint",
    "FormulaReferenceNode",
    "FormulaRowRangeNode",
    "FormulaRowReference",
    "FormulaUnaryNode",
    "Spreadsheet",
    "SpreadsheetCell",
    "SpreadsheetCellError",
    "SpreadsheetCellView",
    "SpreadsheetFormulaParseError",
    "SpreadsheetOutputError",
    "SpreadsheetOutputView",
    "SpreadsheetRange",
    "SpreadsheetResult",
    "SpreadsheetResultError",
    "SpreadsheetSheet",
    "get_spreadsheet_cell",
    "get_spreadsheet_formula",
    "get_spreadsheet_formula_ast",
    "get_spreadsheet_grading_output",
    "get_spreadsheet_result",
    "get_spreadsheet_value",
    "parse_spreadsheet_formula",
]


class SpreadsheetEmptyResult(TypedDict):
    type: Literal["empty"]


class SpreadsheetNumberResult(TypedDict):
    type: Literal["number"]
    value: int | float


class SpreadsheetStringResult(TypedDict):
    type: Literal["string"]
    value: str


class SpreadsheetBooleanResult(TypedDict):
    type: Literal["boolean"]
    value: bool


class SpreadsheetErrorResult(TypedDict):
    type: Literal["error"]
    value: str
    error_type: str


type SpreadsheetResult = (
    SpreadsheetEmptyResult
    | SpreadsheetNumberResult
    | SpreadsheetStringResult
    | SpreadsheetBooleanResult
    | SpreadsheetErrorResult
)


class SpreadsheetCell(TypedDict):
    input: dict[str, object]
    result: SpreadsheetResult


@dataclass(frozen=True, slots=True)
class FormulaCellReference:
    sheet: str | None
    column: str
    row: int
    column_absolute: bool
    row_absolute: bool
    kind: Literal["cell"] = field(default="cell", init=False)


@dataclass(frozen=True, slots=True)
class FormulaColumnReference:
    sheet: str | None
    column: str
    column_absolute: bool
    kind: Literal["column"] = field(default="column", init=False)


@dataclass(frozen=True, slots=True)
class FormulaRowReference:
    sheet: str | None
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


class SpreadsheetResultError(ValueError):
    """Base exception for scalar access to an error-valued result."""

    def __init__(self, error_type: str, error_value: str, message: str) -> None:
        self.error_type = error_type
        self.error_value = error_value
        super().__init__(message)


class SpreadsheetCellError(SpreadsheetResultError):
    """Raised when a scalar value is requested from an error-valued cell."""

    def __init__(
        self, sheet_name: str, address: str, error_type: str, error_value: str
    ) -> None:
        self.sheet_name = sheet_name
        self.address = address
        super().__init__(
            error_type,
            error_value,
            f"Spreadsheet cell {sheet_name}!{address} has error {error_value} ({error_type}).",
        )


class SpreadsheetOutputError(SpreadsheetResultError):
    """Raised when a scalar value is requested from an error-valued output."""

    def __init__(self, output_name: str, error_type: str, error_value: str) -> None:
        self.output_name = output_name
        super().__init__(
            error_type,
            error_value,
            f'Spreadsheet grading output "{output_name}" has error '
            f"{error_value} ({error_type}).",
        )


class SpreadsheetFormulaParseError(ValueError):
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


def _get_sheet(snapshot: Mapping[str, object], sheet_name: str) -> Mapping[str, object]:
    sheets = snapshot.get("sheets", [])
    if not isinstance(sheets, list):
        raise TypeError("The spreadsheet snapshot has an invalid sheets field.")
    for sheet in sheets:
        if isinstance(sheet, Mapping) and sheet.get("name") == sheet_name:
            return sheet
    raise KeyError(f'Unknown spreadsheet sheet "{sheet_name}".')


def get_spreadsheet_cell(
    snapshot: Mapping[str, object], sheet_name: str, address: str
) -> SpreadsheetCell | None:
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
    return cast(SpreadsheetCell, cell)


def get_spreadsheet_result(
    snapshot: Mapping[str, object], sheet_name: str, address: str
) -> SpreadsheetResult:
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
    snapshot: Mapping[str, object], sheet_name: str, address: str
) -> bool | int | float | str | None:
    """Return a scalar calculated value, or raise for a spreadsheet error."""
    result = get_spreadsheet_result(snapshot, sheet_name, address)
    if result["type"] == "empty":
        return None
    if result["type"] == "error":
        raise SpreadsheetCellError(
            sheet_name,
            address.upper(),
            result["error_type"],
            result["value"],
        )
    return result["value"]


def get_spreadsheet_formula(
    snapshot: Mapping[str, object], sheet_name: str, address: str
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


def get_spreadsheet_grading_output(
    snapshot: Mapping[str, object], output_name: str
) -> SpreadsheetResult:
    """Return a named private-workbook output from a normalized snapshot."""
    grading = snapshot.get("grading")
    if not isinstance(grading, Mapping):
        raise KeyError(
            "The spreadsheet snapshot does not contain private grading outputs."
        )
    outputs = grading.get("outputs")
    if not isinstance(outputs, Mapping) or output_name not in outputs:
        raise KeyError(f'Unknown spreadsheet grading output "{output_name}".')
    result = outputs[output_name]
    if not isinstance(result, dict) or not isinstance(result.get("type"), str):
        raise TypeError(f'Spreadsheet grading output "{output_name}" is invalid.')
    return cast(SpreadsheetResult, result)


def _decode_sheet_name(sheet_text: str) -> str:
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
    raise SpreadsheetFormulaParseError(f'Unsupported spreadsheet reference "{text}".')


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
    raise SpreadsheetFormulaParseError(
        f'Spreadsheet range "{text}" has incompatible endpoint types.'
    )


@dataclass(slots=True)
class _FormulaParser:
    tokens: list[_FormulaToken]
    position: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        self.tokens = [
            token
            for token in self.tokens
            if token.type not in {"WSPACE", "WHITE-SPACE"}
        ]

    def parse(self) -> FormulaAstNode:
        result = self._parse_comparison()
        token = self._current()
        if token is not None:
            raise SpreadsheetFormulaParseError(
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
            raise SpreadsheetFormulaParseError("Unexpected end of spreadsheet formula.")
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
                raise SpreadsheetFormulaParseError(
                    "Unclosed spreadsheet formula group."
                )
            return FormulaGroupNode(expression=expression)
        if token.type == "FUNC" and token.subtype == "OPEN":
            return self._parse_function(token)
        if token.type != "OPERAND":
            raise SpreadsheetFormulaParseError(
                f'Unexpected token "{token.value}" in spreadsheet formula.'
            )
        if token.subtype == "RANGE":
            return _parse_reference(token.value)
        if token.subtype == "NUMBER":
            try:
                number = float(token.value)
            except ValueError as exc:
                raise SpreadsheetFormulaParseError(
                    f'Invalid spreadsheet number literal "{token.value}".'
                ) from exc
            if not math.isfinite(number):
                raise SpreadsheetFormulaParseError(
                    "Spreadsheet number literals must be finite."
                )
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
        raise SpreadsheetFormulaParseError(
            f'Unsupported spreadsheet operand "{token.value}".'
        )

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
                raise SpreadsheetFormulaParseError(
                    "Unclosed spreadsheet function call."
                )
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
                raise SpreadsheetFormulaParseError(
                    f'Unexpected token "{token.value}" in spreadsheet function call.'
                )
            if self._current() is None:
                raise SpreadsheetFormulaParseError(
                    "Unclosed spreadsheet function call."
                )

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
        SpreadsheetFormulaParseError: If the formula cannot be represented by the AST.
    """
    if not isinstance(formula, str) or not formula.startswith("="):
        raise SpreadsheetFormulaParseError('Spreadsheet formulas must start with "=".')
    try:
        tokens = cast(list[_FormulaToken], Tokenizer(formula).items)
        root = _FormulaParser(tokens).parse()
    except SpreadsheetFormulaParseError:
        raise
    except Exception as exc:
        raise SpreadsheetFormulaParseError(
            "The spreadsheet formula could not be parsed."
        ) from exc
    return FormulaAst(formula=formula, root=root)


def get_spreadsheet_formula_ast(
    snapshot: Mapping[str, object], sheet_name: str, address: str
) -> FormulaAst | None:
    """Return the versioned AST for a formula cell, or ``None`` otherwise."""
    formula = get_spreadsheet_formula(snapshot, sheet_name, address)
    return None if formula is None else parse_spreadsheet_formula(formula)


@dataclass(frozen=True, slots=True)
class _CellAddress:
    address: str
    row: int
    column: int
    sheet_name: str | None


@dataclass(frozen=True, slots=True)
class _SnapshotReference:
    start: _CellAddress
    end: _CellAddress | None
    sheet_name: str | None


def _decode_snapshot_sheet_name(sheet_text: str, reference: str) -> str:
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


def _parse_snapshot_endpoint(text: str, reference: str) -> _CellAddress:
    if "!" in text:
        sheet_text, address_text = text.rsplit("!", 1)
        sheet_name = _decode_snapshot_sheet_name(sheet_text, reference)
    else:
        address_text = text
        sheet_name = None
    try:
        address, row, column = _normalized_address(address_text)
    except ValueError as exc:
        raise ValueError(f'Invalid spreadsheet reference "{reference}".') from exc
    return _CellAddress(
        address=address,
        row=row,
        column=column,
        sheet_name=sheet_name,
    )


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
        if start.row > end.row or start.column > end.column:
            raise ValueError(
                f'Spreadsheet range "{reference}" must run from top-left to bottom-right.'
            )
        return _SnapshotReference(
            start=start,
            end=end,
            sheet_name=start.sheet_name,
        )

    start = _parse_snapshot_endpoint(reference, reference)
    return _SnapshotReference(
        start=start,
        end=None,
        sheet_name=start.sheet_name,
    )


def _column_name(column: int) -> str:
    result = ""
    value = column + 1
    while value > 0:
        value, remainder = divmod(value - 1, 26)
        result = chr(ord("A") + remainder) + result
    return result


def _qualified_address(sheet_name: str, address: str) -> str:
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.]*", sheet_name):
        encoded_sheet_name = sheet_name
    else:
        encoded_sheet_name = f"'{sheet_name.replace("'", "''")}'"
    return f"{encoded_sheet_name}!{address}"


@dataclass(frozen=True, slots=True, init=False, eq=False, repr=False)
class Spreadsheet:
    """Read-only, spreadsheet-native view of a normalized snapshot."""

    _snapshot: Mapping[str, object]
    _sheet_views: dict[str, SpreadsheetSheet]
    outputs: Mapping[str, SpreadsheetOutputView]

    def __init__(self, snapshot: Mapping[str, object]) -> None:
        if not isinstance(snapshot, Mapping):
            raise TypeError("A spreadsheet snapshot must be a mapping.")
        object.__setattr__(self, "_snapshot", snapshot)
        object.__setattr__(self, "_sheet_views", {})
        object.__setattr__(self, "outputs", _SpreadsheetOutputs(self))

    @property
    def sheet_names(self) -> tuple[str, ...]:
        sheets = self._snapshot.get("sheets", [])
        if not isinstance(sheets, list):
            raise TypeError("The spreadsheet snapshot has an invalid sheets field.")
        names: list[str] = []
        for sheet in sheets:
            if not isinstance(sheet, Mapping):
                raise TypeError("The spreadsheet snapshot contains an invalid sheet.")
            name = sheet.get("name")
            if not isinstance(name, str):
                raise TypeError("The spreadsheet snapshot contains an invalid sheet.")
            names.append(name)
        return tuple(names)

    def __getitem__(self, sheet_name: str) -> SpreadsheetSheet:
        """Return the sheet with the given name."""
        _get_sheet(self._snapshot, sheet_name)
        if sheet_name not in self._sheet_views:
            self._sheet_views[sheet_name] = SpreadsheetSheet(self, sheet_name)
        return self._sheet_views[sheet_name]


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class SpreadsheetSheet:
    """Read-only view of one sheet in a :class:`Spreadsheet`."""

    workbook: Spreadsheet
    name: str

    def _dimensions(self) -> tuple[int, int]:
        sheet = _get_sheet(self.workbook._snapshot, self.name)
        rows = sheet.get("rows")
        columns = sheet.get("columns")
        if (
            isinstance(rows, bool)
            or not isinstance(rows, int)
            or isinstance(columns, bool)
            or not isinstance(columns, int)
        ):
            raise TypeError(f'Spreadsheet sheet "{self.name}" has invalid dimensions.')
        return rows, columns

    @property
    def rows(self) -> int:
        return self._dimensions()[0]

    @property
    def columns(self) -> int:
        return self._dimensions()[1]

    @property
    def shape(self) -> tuple[int, int]:
        return self._dimensions()

    def __getitem__(self, reference: str) -> SpreadsheetCellView | SpreadsheetRange:
        """Resolve an A1 cell or range reference."""
        parsed = _parse_snapshot_reference(reference)
        target_sheet = self.workbook[parsed.sheet_name or self.name]
        get_spreadsheet_cell(
            self.workbook._snapshot, target_sheet.name, parsed.start.address
        )
        if parsed.end is None:
            return SpreadsheetCellView(target_sheet, parsed.start.address)
        if (
            parsed.end.sheet_name is not None
            and parsed.end.sheet_name != target_sheet.name
        ):
            raise ValueError(
                f'Spreadsheet range "{reference}" cannot span multiple sheets.'
            )
        get_spreadsheet_cell(
            self.workbook._snapshot, target_sheet.name, parsed.end.address
        )
        return SpreadsheetRange(
            target_sheet,
            parsed.start.address,
            parsed.end.address,
            parsed.start.row,
            parsed.start.column,
            parsed.end.row,
            parsed.end.column,
        )

    def query(
        self,
        predicate: Callable[[SpreadsheetCellView], bool],
        *,
        include_empty: bool = False,
    ) -> tuple[SpreadsheetCellView, ...]:
        rows, columns = self._dimensions()
        end_address = f"{_column_name(columns - 1)}{rows}"
        sheet_range = cast(SpreadsheetRange, self[f"A1:{end_address}"])
        return sheet_range.query(predicate, include_empty=include_empty)


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class SpreadsheetCellView:
    """Read-only view of one in-bounds cell in a spreadsheet snapshot."""

    sheet: SpreadsheetSheet
    address: str

    @property
    def qualified_address(self) -> str:
        return _qualified_address(self.sheet.name, self.address)

    @property
    def row(self) -> int:
        return _normalized_address(self.address)[1] + 1

    @property
    def column(self) -> str:
        match = _CELL_ADDRESS_RE.fullmatch(self.address)
        assert match is not None
        return match.group(1)

    @property
    def input(self) -> dict[str, object] | None:
        cell = get_spreadsheet_cell(
            self.sheet.workbook._snapshot, self.sheet.name, self.address
        )
        if cell is None:
            return None
        cell_input = cell.get("input")
        if not isinstance(cell_input, dict):
            raise TypeError(
                f'Spreadsheet cell "{self.qualified_address}" has an invalid input.'
            )
        return dict(cell_input)

    @property
    def result(self) -> SpreadsheetResult:
        result = get_spreadsheet_result(
            self.sheet.workbook._snapshot, self.sheet.name, self.address
        )
        return cast(SpreadsheetResult, dict(result))

    @property
    def value(self) -> bool | int | float | str | None:
        return get_spreadsheet_value(
            self.sheet.workbook._snapshot, self.sheet.name, self.address
        )

    @property
    def formula(self) -> str | None:
        return get_spreadsheet_formula(
            self.sheet.workbook._snapshot, self.sheet.name, self.address
        )

    @property
    def formula_ast(self) -> FormulaAst | None:
        return get_spreadsheet_formula_ast(
            self.sheet.workbook._snapshot, self.sheet.name, self.address
        )

    @property
    def is_empty(self) -> bool:
        return (
            get_spreadsheet_cell(
                self.sheet.workbook._snapshot, self.sheet.name, self.address
            )
            is None
        )

    @property
    def is_formula(self) -> bool:
        return self.formula is not None

    @property
    def is_error(self) -> bool:
        return self.result["type"] == "error"

    def matches_formula(self, expected: str, *, structural: bool = False) -> bool:
        formula = self.formula
        if formula is None:
            return False
        if not structural:
            return formula == expected
        return (
            parse_spreadsheet_formula(formula).root
            == parse_spreadsheet_formula(expected).root
        )


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class SpreadsheetRange:
    """Read-only rectangular cell range on one sheet."""

    sheet: SpreadsheetSheet
    _start_address: str
    _end_address: str
    _start_row: int
    _start_column: int
    _end_row: int
    _end_column: int

    @property
    def address(self) -> str:
        return f"{self._start_address}:{self._end_address}"

    @property
    def qualified_address(self) -> str:
        return _qualified_address(self.sheet.name, self.address)

    @property
    def shape(self) -> tuple[int, int]:
        return (
            self._end_row - self._start_row + 1,
            self._end_column - self._start_column + 1,
        )

    @property
    def cells(self) -> tuple[tuple[SpreadsheetCellView, ...], ...]:
        return tuple(
            tuple(
                SpreadsheetCellView(self.sheet, f"{_column_name(column)}{row + 1}")
                for column in range(self._start_column, self._end_column + 1)
            )
            for row in range(self._start_row, self._end_row + 1)
        )

    @property
    def inputs(self) -> tuple[tuple[dict[str, object] | None, ...], ...]:
        return tuple(tuple(cell.input for cell in row) for row in self.cells)

    @property
    def results(self) -> tuple[tuple[SpreadsheetResult, ...], ...]:
        return tuple(tuple(cell.result for cell in row) for row in self.cells)

    @property
    def values(
        self,
    ) -> tuple[tuple[bool | int | float | str | None, ...], ...]:
        return tuple(tuple(cell.value for cell in row) for row in self.cells)

    @property
    def formulas(self) -> tuple[tuple[str | None, ...], ...]:
        return tuple(tuple(cell.formula for cell in row) for row in self.cells)

    def iter_cells(
        self, *, include_empty: bool = True
    ) -> Iterator[SpreadsheetCellView]:
        for row in self.cells:
            for cell in row:
                if include_empty or not cell.is_empty:
                    yield cell

    def query(
        self,
        predicate: Callable[[SpreadsheetCellView], bool],
        *,
        include_empty: bool = False,
    ) -> tuple[SpreadsheetCellView, ...]:
        return tuple(
            cell
            for cell in self.iter_cells(include_empty=include_empty)
            if predicate(cell)
        )

    def __getitem__(self, reference: str) -> SpreadsheetCellView:
        """Return a cell within this range."""
        parsed = _parse_snapshot_reference(reference)
        if parsed.end is not None:
            raise ValueError("Spreadsheet ranges can only be indexed by a single cell.")
        target_sheet_name = parsed.sheet_name or self.sheet.name
        if target_sheet_name != self.sheet.name:
            raise ValueError(
                f'Spreadsheet cell "{reference}" is outside range '
                f'"{self.qualified_address}".'
            )
        if not (
            self._start_row <= parsed.start.row <= self._end_row
            and self._start_column <= parsed.start.column <= self._end_column
        ):
            raise ValueError(
                f'Spreadsheet cell "{reference}" is outside range '
                f'"{self.qualified_address}".'
            )
        return SpreadsheetCellView(self.sheet, parsed.start.address)


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class SpreadsheetOutputView:
    """Read-only view of a named private grading output."""

    _workbook: Spreadsheet
    name: str

    @property
    def result(self) -> SpreadsheetResult:
        result = get_spreadsheet_grading_output(self._workbook._snapshot, self.name)
        return cast(SpreadsheetResult, dict(result))

    @property
    def value(self) -> bool | int | float | str | None:
        result = self.result
        if result["type"] == "empty":
            return None
        if result["type"] == "error":
            raise SpreadsheetOutputError(
                self.name,
                result["error_type"],
                result["value"],
            )
        return result["value"]

    @property
    def is_error(self) -> bool:
        return self.result["type"] == "error"

    @property
    def error_type(self) -> str | None:
        result = self.result
        return result["error_type"] if result["type"] == "error" else None

    @property
    def error_value(self) -> str | None:
        result = self.result
        return result["value"] if result["type"] == "error" else None


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class _SpreadsheetOutputs(Mapping[str, SpreadsheetOutputView]):
    _workbook: Spreadsheet

    def _output_names(self) -> tuple[str, ...]:
        grading = self._workbook._snapshot.get("grading")
        if grading is None:
            return ()
        if not isinstance(grading, Mapping):
            raise TypeError(
                "The spreadsheet snapshot has invalid private grading outputs."
            )
        outputs = grading.get("outputs")
        if not isinstance(outputs, Mapping):
            raise TypeError(
                "The spreadsheet snapshot has invalid private grading outputs."
            )
        if not all(isinstance(name, str) for name in outputs):
            raise TypeError(
                "The spreadsheet snapshot has invalid private grading outputs."
            )
        return tuple(cast(str, name) for name in outputs)

    def __getitem__(self, name: str) -> SpreadsheetOutputView:
        get_spreadsheet_grading_output(self._workbook._snapshot, name)
        return SpreadsheetOutputView(self._workbook, name)

    def __iter__(self) -> Iterator[str]:
        return iter(self._output_names())

    def __len__(self) -> int:
        return len(self._output_names())
