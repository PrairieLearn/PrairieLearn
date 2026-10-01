"""Utilities for grading normalized ``pl-spreadsheet`` submissions."""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Mapping
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
    "SpreadsheetCell",
    "SpreadsheetCellError",
    "SpreadsheetFormulaParseError",
    "SpreadsheetResult",
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


class FormulaCellReference(TypedDict):
    kind: Literal["cell"]
    sheet: str | None
    column: str
    row: int
    column_absolute: bool
    row_absolute: bool


class FormulaColumnReference(TypedDict):
    kind: Literal["column"]
    sheet: str | None
    column: str
    column_absolute: bool


class FormulaRowReference(TypedDict):
    kind: Literal["row"]
    sheet: str | None
    row: int
    row_absolute: bool


type FormulaReferenceEndpoint = (
    FormulaCellReference | FormulaColumnReference | FormulaRowReference
)


class FormulaLiteralNode(TypedDict):
    type: Literal["literal"]
    value_type: Literal["number", "string", "boolean", "error"]
    value: object


class FormulaReferenceNode(TypedDict):
    type: Literal["reference"]
    reference: FormulaReferenceEndpoint


class FormulaCellRangeNode(TypedDict):
    type: Literal["range"]
    start: FormulaCellReference
    end: FormulaCellReference


class FormulaColumnRangeNode(TypedDict):
    type: Literal["range"]
    start: FormulaColumnReference
    end: FormulaColumnReference


class FormulaRowRangeNode(TypedDict):
    type: Literal["range"]
    start: FormulaRowReference
    end: FormulaRowReference


type FormulaRangeNode = (
    FormulaCellRangeNode | FormulaColumnRangeNode | FormulaRowRangeNode
)


class FormulaFunctionNode(TypedDict):
    type: Literal["function"]
    name: str
    arguments: list[FormulaAstNode]


class FormulaUnaryNode(TypedDict):
    type: Literal["unary"]
    operator: Literal["+", "-"]
    operand: FormulaAstNode


class FormulaPostfixNode(TypedDict):
    type: Literal["postfix"]
    operator: Literal["%"]
    operand: FormulaAstNode


class FormulaBinaryNode(TypedDict):
    type: Literal["binary"]
    operator: Literal["+", "-", "*", "/", "^", "&", "=", "<>", "<", ">", "<=", ">="]
    left: FormulaAstNode
    right: FormulaAstNode


class FormulaGroupNode(TypedDict):
    type: Literal["group"]
    expression: FormulaAstNode


class FormulaEmptyNode(TypedDict):
    type: Literal["empty"]


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


class FormulaAst(TypedDict):
    schema_version: Literal[1]
    formula: str
    root: FormulaAstNode


class SpreadsheetCellError(ValueError):
    """Raised when a scalar value is requested from an error-valued cell."""

    def __init__(
        self, sheet_name: str, address: str, error_type: str, error_value: str
    ) -> None:
        self.sheet_name = sheet_name
        self.address = address
        self.error_type = error_type
        self.error_value = error_value
        super().__init__(
            f"Spreadsheet cell {sheet_name}!{address} has error {error_value} ({error_type})."
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
        return {
            "kind": "cell",
            "sheet": sheet,
            "column": cell_match.group(2),
            "row": int(cell_match.group(4)),
            "column_absolute": cell_match.group(1) == "$",
            "row_absolute": cell_match.group(3) == "$",
        }
    column_match = _REFERENCE_COLUMN_RE.fullmatch(reference)
    if column_match is not None:
        return {
            "kind": "column",
            "sheet": sheet,
            "column": column_match.group(2),
            "column_absolute": column_match.group(1) == "$",
        }
    row_match = _REFERENCE_ROW_RE.fullmatch(reference)
    if row_match is not None:
        return {
            "kind": "row",
            "sheet": sheet,
            "row": int(row_match.group(2)),
            "row_absolute": row_match.group(1) == "$",
        }
    raise SpreadsheetFormulaParseError(f'Unsupported spreadsheet reference "{text}".')


def _parse_reference(text: str) -> FormulaReferenceNode | FormulaRangeNode:
    if ":" not in text:
        return {"type": "reference", "reference": _parse_reference_endpoint(text)}
    start_text, end_text = text.split(":", 1)
    start = _parse_reference_endpoint(start_text)
    end = _parse_reference_endpoint(end_text)
    if start["kind"] == "cell" and end["kind"] == "cell":
        return {"type": "range", "start": start, "end": end}
    if start["kind"] == "column" and end["kind"] == "column":
        return {"type": "range", "start": start, "end": end}
    if start["kind"] == "row" and end["kind"] == "row":
        return {"type": "range", "start": start, "end": end}
    raise SpreadsheetFormulaParseError(
        f'Spreadsheet range "{text}" has incompatible endpoint types.'
    )


class _FormulaParser:
    def __init__(self, tokens: list[_FormulaToken]) -> None:
        self.tokens = [token for token in tokens if token.type != "WSPACE"]
        self.position = 0

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
        operators: set[str],
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
            result = cast(
                FormulaBinaryNode,
                {
                    "type": "binary",
                    "operator": operator,
                    "left": result,
                    "right": right,
                },
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
            return cast(
                FormulaUnaryNode,
                {
                    "type": "unary",
                    "operator": operator,
                    "operand": self._parse_prefix(),
                },
            )
        return self._parse_postfix()

    def _parse_postfix(self) -> FormulaAstNode:
        result = self._parse_primary()
        while True:
            token = self._current()
            if token is None or token.type != "OPERATOR-POSTFIX" or token.value != "%":
                return result
            self._take()
            result = cast(
                FormulaPostfixNode,
                {"type": "postfix", "operator": "%", "operand": result},
            )

    def _parse_primary(self) -> FormulaAstNode:
        token = self._take()
        if token.type == "PAREN" and token.subtype == "OPEN":
            expression = self._parse_comparison()
            close = self._take()
            if close.type != "PAREN" or close.subtype != "CLOSE":
                raise SpreadsheetFormulaParseError(
                    "Unclosed spreadsheet formula group."
                )
            return {"type": "group", "expression": expression}
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
            return {"type": "literal", "value_type": "number", "value": number_value}
        if token.subtype == "TEXT":
            string_value = token.value[1:-1].replace('""', '"')
            return {
                "type": "literal",
                "value_type": "string",
                "value": string_value,
            }
        if token.subtype == "LOGICAL":
            return {
                "type": "literal",
                "value_type": "boolean",
                "value": token.value.upper() == "TRUE",
            }
        if token.subtype == "ERROR":
            return {
                "type": "literal",
                "value_type": "error",
                "value": token.value.upper(),
            }
        raise SpreadsheetFormulaParseError(
            f'Unsupported spreadsheet operand "{token.value}".'
        )

    def _parse_function(self, opening: _FormulaToken) -> FormulaFunctionNode:
        arguments: list[FormulaAstNode] = []
        token = self._current()
        if token is not None and token.type == "FUNC" and token.subtype == "CLOSE":
            self._take()
            return {
                "type": "function",
                "name": opening.value[:-1].upper(),
                "arguments": arguments,
            }

        while True:
            token = self._current()
            if token is None:
                raise SpreadsheetFormulaParseError(
                    "Unclosed spreadsheet function call."
                )
            if token.type == "SEP" and token.subtype == "ARG":
                arguments.append({"type": "empty"})
                self._take()
                continue
            if token.type == "FUNC" and token.subtype == "CLOSE":
                arguments.append({"type": "empty"})
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

        return {
            "type": "function",
            "name": opening.value[:-1].upper(),
            "arguments": arguments,
        }


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
    return {"schema_version": 1, "formula": formula, "root": root}


def get_spreadsheet_formula_ast(
    snapshot: Mapping[str, object], sheet_name: str, address: str
) -> FormulaAst | None:
    """Return the versioned AST for a formula cell, or ``None`` otherwise."""
    formula = get_spreadsheet_formula(snapshot, sheet_name, address)
    return None if formula is None else parse_spreadsheet_formula(formula)
