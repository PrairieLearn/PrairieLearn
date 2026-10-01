"""Utilities for grading normalized ``pl-spreadsheet`` submissions."""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Iterator, Mapping
from dataclasses import InitVar, dataclass, field
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
    "SpreadsheetBook",
    "SpreadsheetCell",
    "SpreadsheetCellError",
    "SpreadsheetCellView",
    "SpreadsheetFormulaParseError",
    "SpreadsheetOutputError",
    "SpreadsheetOutputView",
    "SpreadsheetRange",
    "SpreadsheetResult",
    "SpreadsheetResultError",
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
    row: int
    column: int
    sheet_name: str | None

    @property
    def address(self) -> str:
        return f"{_column_name(self.column)}{self.row + 1}"


@dataclass(frozen=True, slots=True)
class _SnapshotReference:
    start: _CellAddress
    end: _CellAddress | None
    sheet_name: str | None


@dataclass(frozen=True, slots=True)
class _SpreadsheetCellData:
    input: dict[str, object]
    result: SpreadsheetResult


@dataclass(frozen=True, slots=True)
class _SpreadsheetCells:
    name: str
    rows: int
    columns: int
    cells: dict[str, _SpreadsheetCellData]


def _validated_snapshot_input(value: object, context: str) -> dict[str, object]:
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
    elif input_type in {"string", "formula"}:
        if not isinstance(input_value, str):
            raise TypeError(f"{context} has an invalid input.")
        if input_type == "formula" and not input_value.startswith("="):
            raise TypeError(f"{context} has an invalid input.")
    elif input_type == "boolean":
        if not isinstance(input_value, bool):
            raise TypeError(f"{context} has an invalid input.")
    else:
        raise TypeError(f"{context} has an invalid input.")
    return {"type": input_type, "value": input_value}


def _validated_snapshot_result(value: object, context: str) -> SpreadsheetResult:
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
        _, row, column = _normalized_address(address_text)
    except ValueError as exc:
        raise ValueError(f'Invalid spreadsheet reference "{reference}".') from exc
    return _CellAddress(
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


def _address_from_indices(
    row: int, column: int, sheet_name: str | None = None
) -> _CellAddress:
    return _CellAddress(
        row=row,
        column=column,
        sheet_name=sheet_name,
    )


def _qualified_address(sheet_name: str, address: str) -> str:
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.]*", sheet_name):
        encoded_sheet_name = sheet_name
    else:
        encoded_sheet_name = f"'{sheet_name.replace("'", "''")}'"
    return f"{encoded_sheet_name}!{address}"


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class SpreadsheetBook:
    """Read-only, spreadsheet-native view of a normalized snapshot."""

    snapshot: InitVar[Mapping[str, object]]
    _sheets: dict[str, _SpreadsheetCells] = field(init=False)
    _sheet_views: dict[str, Spreadsheet] = field(init=False)
    _grading_outputs: dict[str, SpreadsheetResult] = field(init=False)
    _has_grading: bool = field(init=False)
    sheet_names: tuple[str, ...] = field(init=False)
    outputs: Mapping[str, SpreadsheetOutputView] = field(init=False)

    def __post_init__(self, snapshot: Mapping[str, object]) -> None:
        """Validate and index the normalized snapshot."""
        if not isinstance(snapshot, Mapping):
            raise TypeError("A spreadsheet snapshot must be a mapping.")

        raw_sheets = snapshot.get("sheets", [])
        if not isinstance(raw_sheets, list):
            raise TypeError("The spreadsheet snapshot has an invalid sheets field.")
        sheets: dict[str, _SpreadsheetCells] = {}
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

            raw_cells = raw_sheet.get("cells", {})
            if not isinstance(raw_cells, Mapping):
                raise TypeError(f'Spreadsheet sheet "{name}" has invalid cells.')
            cells: dict[str, _SpreadsheetCellData] = {}
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
                cells[address] = _SpreadsheetCellData(
                    input=_validated_snapshot_input(raw_cell.get("input"), context),
                    result=_validated_snapshot_result(raw_cell.get("result"), context),
                )
            sheets[name] = _SpreadsheetCells(
                name=name,
                rows=rows,
                columns=columns,
                cells=cells,
            )

        grading = snapshot.get("grading")
        grading_outputs: dict[str, SpreadsheetResult] = {}
        if grading is not None:
            if not isinstance(grading, Mapping):
                raise TypeError(
                    "The spreadsheet snapshot has invalid private grading outputs."
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
        object.__setattr__(self, "outputs", _SpreadsheetOutputs(self))

    def _sheet_data(self, sheet_name: str) -> _SpreadsheetCells:
        try:
            return self._sheets[sheet_name]
        except KeyError:
            raise KeyError(f'Unknown spreadsheet sheet "{sheet_name}".') from None

    def _grading_output(self, name: str) -> SpreadsheetResult:
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

    def __getitem__(self, sheet_name: str) -> Spreadsheet:
        """Return the sheet with the given name."""
        data = self._sheet_data(sheet_name)
        if sheet_name not in self._sheet_views:
            self._sheet_views[sheet_name] = Spreadsheet(self, data)
        return self._sheet_views[sheet_name]


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class Spreadsheet:
    """Read-only view of one sheet in a :class:`Spreadsheet`."""

    book: SpreadsheetBook
    _cells: _SpreadsheetCells

    @property
    def name(self) -> str:
        return self._cells.name

    @property
    def rows(self) -> int:
        return self._cells.rows

    @property
    def columns(self) -> int:
        return self._cells.columns

    @property
    def shape(self) -> tuple[int, int]:
        return (self.rows, self.columns)

    def _validate_address(self, address: _CellAddress) -> None:
        if not (0 <= address.row < self.rows and 0 <= address.column < self.columns):
            raise ValueError(
                f'Spreadsheet cell "{self.name}!{address.address}" is outside the sheet.'
            )

    def _cell_data(self, address: _CellAddress) -> _SpreadsheetCellData | None:
        self._validate_address(address)
        return self._cells.cells.get(address.address)

    def __getitem__(self, reference: str) -> SpreadsheetCellView | SpreadsheetRange:
        """Resolve an A1 cell or range reference."""
        parsed = _parse_snapshot_reference(reference)
        target_sheet = self.book[parsed.sheet_name or self.name]
        if parsed.end is None:
            return SpreadsheetCellView(target_sheet, parsed.start)
        if (
            parsed.end.sheet_name is not None
            and parsed.end.sheet_name != target_sheet.name
        ):
            raise ValueError(
                f'Spreadsheet range "{reference}" cannot span multiple sheets.'
            )
        return SpreadsheetRange(target_sheet, parsed.start, parsed.end)

    def cell(self, reference: str) -> SpreadsheetCellView:
        """Resolve an A1 cell reference."""
        cell = self[reference]
        if not isinstance(cell, SpreadsheetCellView):
            raise TypeError(f'Spreadsheet reference "{reference}" is not a cell.')
        return cell

    def range(self, reference: str) -> SpreadsheetRange:
        """Resolve an A1 range reference."""
        cell_range = self[reference]
        if not isinstance(cell_range, SpreadsheetRange):
            raise TypeError(f'Spreadsheet reference "{reference}" is not a range.')
        return cell_range

    def query(
        self,
        predicate: Callable[[SpreadsheetCellView], bool],
        *,
        include_empty: bool = False,
    ) -> tuple[SpreadsheetCellView, ...]:
        end_address = f"{_column_name(self.columns - 1)}{self.rows}"
        sheet_range = self.range(f"A1:{end_address}")
        return sheet_range.query(predicate, include_empty=include_empty)


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class SpreadsheetCellView:
    """Read-only view of one in-bounds cell in a spreadsheet snapshot."""

    sheet: Spreadsheet
    _location: _CellAddress
    row: int = field(init=False)
    column: str = field(init=False)
    _cell: _SpreadsheetCellData | None = field(init=False)

    def __post_init__(self) -> None:
        """Validate the address and cache the cell's derived metadata."""
        cell = self.sheet._cell_data(self._location)
        object.__setattr__(self, "row", self._location.row + 1)
        object.__setattr__(self, "column", _column_name(self._location.column))
        object.__setattr__(self, "_cell", cell)

    @property
    def address(self) -> str:
        return self._location.address

    @property
    def qualified_address(self) -> str:
        return _qualified_address(self.sheet.name, self.address)

    @property
    def formula(self) -> str | None:
        if self._cell is None or self._cell.input["type"] != "formula":
            return None
        return cast(str, self._cell.input["value"])

    @property
    def is_empty(self) -> bool:
        return self._cell is None

    @property
    def is_formula(self) -> bool:
        return self.formula is not None

    @property
    def is_error(self) -> bool:
        return self._cell is not None and self._cell.result["type"] == "error"

    @property
    def input(self) -> dict[str, object] | None:
        if self._cell is None:
            return None
        return dict(self._cell.input)

    @property
    def result(self) -> SpreadsheetResult:
        if self._cell is None:
            return {"type": "empty"}
        return cast(SpreadsheetResult, dict(self._cell.result))

    @property
    def value(self) -> bool | int | float | str | None:
        result = self.result
        if result["type"] == "empty":
            return None
        if result["type"] == "error":
            raise SpreadsheetCellError(
                self.sheet.name,
                self.address,
                result["error_type"],
                result["value"],
            )
        return result["value"]

    @property
    def formula_ast(self) -> FormulaAst | None:
        return None if self.formula is None else parse_spreadsheet_formula(self.formula)

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

    sheet: Spreadsheet
    _start: _CellAddress
    _end: _CellAddress

    def __post_init__(self) -> None:
        """Validate the range endpoints."""
        self.sheet._validate_address(self._start)
        self.sheet._validate_address(self._end)
        if self._start.row > self._end.row or self._start.column > self._end.column:
            raise ValueError(
                f'Spreadsheet range "{self._start.address}:{self._end.address}" '
                "must run from top-left to bottom-right."
            )

    @property
    def address(self) -> str:
        return f"{self._start.address}:{self._end.address}"

    @property
    def qualified_address(self) -> str:
        return _qualified_address(self.sheet.name, self.address)

    @property
    def shape(self) -> tuple[int, int]:
        return (
            self._end.row - self._start.row + 1,
            self._end.column - self._start.column + 1,
        )

    @property
    def cells(self) -> tuple[tuple[SpreadsheetCellView, ...], ...]:
        return tuple(
            tuple(
                SpreadsheetCellView(self.sheet, _address_from_indices(row, column))
                for column in range(self._start.column, self._end.column + 1)
            )
            for row in range(self._start.row, self._end.row + 1)
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
            self._start.row <= parsed.start.row <= self._end.row
            and self._start.column <= parsed.start.column <= self._end.column
        ):
            raise ValueError(
                f'Spreadsheet cell "{reference}" is outside range '
                f'"{self.qualified_address}".'
            )
        return SpreadsheetCellView(self.sheet, parsed.start)


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class SpreadsheetOutputView:
    """Read-only view of a named private grading output."""

    _spreadsheet: SpreadsheetBook
    name: str
    _result: SpreadsheetResult = field(init=False)

    def __post_init__(self) -> None:
        """Resolve and cache the named output."""
        result = self._spreadsheet._grading_output(self.name)
        object.__setattr__(self, "_result", result)

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
    def result(self) -> SpreadsheetResult:
        return cast(SpreadsheetResult, dict(self._result))

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


@dataclass(frozen=True, slots=True, eq=False, repr=False)
class _SpreadsheetOutputs(Mapping[str, SpreadsheetOutputView]):
    _spreadsheet: SpreadsheetBook

    def __getitem__(self, name: str) -> SpreadsheetOutputView:
        return SpreadsheetOutputView(self._spreadsheet, name)

    def __iter__(self) -> Iterator[str]:
        return iter(self._spreadsheet._grading_output_names())

    def __len__(self) -> int:
        return len(self._spreadsheet._grading_output_names())
