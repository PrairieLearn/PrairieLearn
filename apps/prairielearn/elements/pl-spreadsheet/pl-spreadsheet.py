from __future__ import annotations

import base64
import hashlib
import json
import math
import pathlib
import re
from typing import Any

import chevron
import lxml.html
import prairielearn as pl

SCHEMA_MANIFEST_PATH = pathlib.Path(__file__).parent / "schema.json"

DEFAULT_ARIA_LABEL = "Spreadsheet"
DEFAULT_HEIGHT = "500px"
DEFAULT_ALLOW_BLANK = False

MAX_SHEETS = 10
MAX_ROWS = 1000
MAX_COLUMNS = 100
MAX_ADDRESSABLE_CELLS = 10_000
MAX_POPULATED_CELLS = 2500
MAX_FORMULAS = 1000
MAX_FORMULA_LENGTH = 2048
MAX_TEXT_LENGTH = 32 * 1024
MAX_PAYLOAD_BYTES = 1024 * 1024
MAX_GRADING_OUTPUTS = 100

CELL_ADDRESS_RE = re.compile(r"^([A-Z]+)([1-9][0-9]*)$")
BLOCKED_SHEET_NAME_CHARACTERS = frozenset("!:<>{}[]\0")
CSS_SIZE_RE = re.compile(
    r"^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|vh|vw|vmin|vmax|%))$",
    re.IGNORECASE,
)
FUNCTION_RE = re.compile(r"\b([A-Z][A-Z0-9.]*)\s*\(", re.IGNORECASE)

ALLOWED_FUNCTIONS = {
    "ABS",
    "AND",
    "AVERAGE",
    "AVERAGEIF",
    "AVERAGEIFS",
    "CONCATENATE",
    "COS",
    "COUNT",
    "COUNTA",
    "COUNTBLANK",
    "COUNTIF",
    "COUNTIFS",
    "DATE",
    "DAY",
    "DAYS",
    "DEGREES",
    "EDATE",
    "EOMONTH",
    "EXP",
    "FALSE",
    "HLOOKUP",
    "IF",
    "IFERROR",
    "IFNA",
    "INDEX",
    "INT",
    "ISBLANK",
    "ISERROR",
    "ISLOGICAL",
    "ISNUMBER",
    "ISTEXT",
    "LEFT",
    "LEN",
    "LN",
    "LOG",
    "LOG10",
    "LOWER",
    "MATCH",
    "MAX",
    "MEDIAN",
    "MID",
    "MIN",
    "MOD",
    "MONTH",
    "NOT",
    "OR",
    "PI",
    "POWER",
    "PRODUCT",
    "RADIANS",
    "RIGHT",
    "ROUND",
    "ROUNDDOWN",
    "ROUNDUP",
    "SIN",
    "SQRT",
    "SUM",
    "SUMIF",
    "SUMIFS",
    "SUMPRODUCT",
    "SWITCH",
    "TAN",
    "TEXT",
    "TRIM",
    "TRUE",
    "UPPER",
    "VALUE",
    "VLOOKUP",
    "XOR",
    "YEAR",
}


def _column_index(column_name: str) -> int:
    result = 0
    for character in column_name:
        result = result * 26 + ord(character) - ord("A") + 1
    return result - 1


def _column_name(column: int) -> str:
    result = ""
    value = column + 1
    while value:
        value, remainder = divmod(value - 1, 26)
        result = chr(ord("A") + remainder) + result
    return result


def _parse_address(address: str) -> tuple[int, int] | None:
    match = CELL_ADDRESS_RE.fullmatch(address.upper())
    if match is None:
        return None
    return int(match.group(2)) - 1, _column_index(match.group(1))


def _parse_range(range_text: str) -> pl.SpreadsheetAddressRange | None:
    try:
        return pl.SpreadsheetAddressRange.from_a1(range_text)
    except (TypeError, ValueError):
        return None


def _strip_formula_strings(formula: str) -> str:
    result: list[str] = []
    in_string = False
    index = 0
    while index < len(formula):
        character = formula[index]
        if character == '"':
            if in_string and index + 1 < len(formula) and formula[index + 1] == '"':
                result.extend((" ", " "))
                index += 2
                continue
            in_string = not in_string
            result.append(" ")
        else:
            result.append(" " if in_string else character)
        index += 1
    return "".join(result)


def _validate_formula(formula: str, location: str) -> None:
    if len(formula) > MAX_FORMULA_LENGTH:
        raise ValueError(
            f"Formula in {location} exceeds the {MAX_FORMULA_LENGTH}-character limit."
        )
    source = _strip_formula_strings(formula)
    if any(character in source for character in "[{}]"):
        raise ValueError(
            f"Formula in {location} uses an external, structured, or array reference, which is not supported."
        )
    for match in FUNCTION_RE.finditer(source):
        function_name = match.group(1).upper()
        if function_name not in ALLOWED_FUNCTIONS:
            raise ValueError(
                f"Formula in {location} uses unsupported function {function_name}."
            )


def _normalize_cell_value(value: Any, location: str) -> str | float | bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        number = float(value) if isinstance(value, float) else value
        if not math.isfinite(number):
            raise ValueError(f"Cell {location} must contain a finite number.")
        return number
    if not isinstance(value, str):
        raise TypeError(
            f"Cell {location} must contain a string, finite number, or boolean."
        )
    if len(value) > MAX_TEXT_LENGTH:
        raise ValueError(
            f"Cell {location} exceeds the {MAX_TEXT_LENGTH}-character text limit."
        )
    if value.startswith("="):
        _validate_formula(value, location)
    return value


def _normalize_sheet_name(value: Any, description: str) -> str:
    if (
        not isinstance(value, str)
        or not 1 <= len(value) <= 31
        or value.strip() != value
        or any(character in BLOCKED_SHEET_NAME_CHARACTERS for character in value)
    ):
        raise ValueError(
            f"{description} must have a non-empty name of at most 31 characters without leading or trailing whitespace. The characters !, :, <, >, {{, }}, [, ], and null are not allowed."
        )
    return value


def _normalize_template(raw_template: Any) -> dict[str, Any]:
    if not isinstance(raw_template, dict) or raw_template.get("schema_version") != 1:
        raise ValueError(
            'The spreadsheet template must be an object with "schema_version": 1.'
        )
    raw_sheets = raw_template.get("sheets")
    if not isinstance(raw_sheets, list) or not 1 <= len(raw_sheets) <= MAX_SHEETS:
        raise ValueError(
            f"The spreadsheet template must contain 1 to {MAX_SHEETS} sheets."
        )

    normalized_sheets: list[dict[str, Any]] = []
    names: set[str] = set()
    total_addressable = 0
    total_populated = 0
    total_formulas = 0

    for sheet_index, raw_sheet in enumerate(raw_sheets, start=1):
        if not isinstance(raw_sheet, dict):
            raise TypeError(f"Sheet {sheet_index} must be an object.")
        name = _normalize_sheet_name(raw_sheet.get("name"), f"Sheet {sheet_index}")
        folded_name = name.casefold()
        if folded_name in names:
            raise ValueError(f'Sheet name "{name}" is duplicated.')
        names.add(folded_name)

        rows = raw_sheet.get("rows")
        columns = raw_sheet.get("columns")
        if (
            isinstance(rows, bool)
            or not isinstance(rows, int)
            or not 1 <= rows <= MAX_ROWS
        ):
            raise ValueError(f'Sheet "{name}" rows must be between 1 and {MAX_ROWS}.')
        if (
            isinstance(columns, bool)
            or not isinstance(columns, int)
            or not 1 <= columns <= MAX_COLUMNS
        ):
            raise ValueError(
                f'Sheet "{name}" columns must be between 1 and {MAX_COLUMNS}.'
            )
        total_addressable += rows * columns

        raw_student_range = raw_sheet.get("student_range")
        if raw_student_range is None:
            student_range = pl.SpreadsheetAddressRange(
                pl.SpreadsheetAddress(row=0, column=0),
                pl.SpreadsheetAddress(row=rows - 1, column=columns - 1),
            )
        elif not isinstance(raw_student_range, str):
            raise TypeError(f'Sheet "{name}" student_range must be a string.')
        else:
            student_range = _parse_range(raw_student_range)
            if (
                student_range is None
                or student_range.end_row >= rows
                or student_range.end_column >= columns
            ):
                raise ValueError(
                    f'Student range "{raw_student_range}" is outside sheet "{name}".'
                )

        raw_cells = raw_sheet.get("cells", {})
        if not isinstance(raw_cells, dict):
            raise TypeError(f'Sheet "{name}" cells must be an object.')
        cells: dict[str, str | float | bool] = {}
        for raw_address, value in raw_cells.items():
            if not isinstance(raw_address, str):
                raise TypeError(f'Cell addresses in sheet "{name}" must be strings.')
            address = raw_address.upper()
            position = _parse_address(address)
            if position is None or position[0] >= rows or position[1] >= columns:
                raise ValueError(f'Cell "{raw_address}" is outside sheet "{name}".')
            if not student_range.contains_cell(*position):
                raise ValueError(
                    f'Cell "{raw_address}" is outside the student range for sheet "{name}".'
                )
            if address in cells:
                raise ValueError(f'Cell "{address}" is duplicated in sheet "{name}".')
            cells[address] = _normalize_cell_value(value, f"{name}!{address}")
            total_populated += 1
            if isinstance(value, str) and value.startswith("="):
                total_formulas += 1

        raw_ranges = raw_sheet.get("editable_ranges", [])
        if not isinstance(raw_ranges, list) or len(raw_ranges) > 100:
            raise ValueError(
                f'Sheet "{name}" editable_ranges must be a list of at most 100 ranges.'
            )
        editable_ranges: list[str] = []
        for raw_range in raw_ranges:
            if not isinstance(raw_range, str):
                raise TypeError(f'Editable ranges in sheet "{name}" must be strings.')
            parsed_range = _parse_range(raw_range)
            if (
                parsed_range is None
                or parsed_range.end_row >= rows
                or parsed_range.end_column >= columns
                or not student_range.contains_range(parsed_range)
            ):
                raise ValueError(
                    f'Editable range "{raw_range}" is outside the student range for sheet "{name}".'
                )
            editable_ranges.append(parsed_range.address)

        normalized_sheet = {
            "name": name,
            "rows": rows,
            "columns": columns,
            "cells": cells,
            "editable_ranges": editable_ranges,
        }
        if raw_student_range is not None:
            normalized_sheet["student_range"] = student_range.address
        normalized_sheets.append(normalized_sheet)

    if total_addressable > MAX_ADDRESSABLE_CELLS:
        raise ValueError(
            f"Spreadsheet templates may contain at most {MAX_ADDRESSABLE_CELLS} addressable cells."
        )
    if total_populated > MAX_POPULATED_CELLS:
        raise ValueError(
            f"Spreadsheet templates may contain at most {MAX_POPULATED_CELLS} populated cells."
        )
    if total_formulas > MAX_FORMULAS:
        raise ValueError(
            f"Spreadsheet templates may contain at most {MAX_FORMULAS} formulas."
        )
    return {"schema_version": 1, "sheets": normalized_sheets}


def _template_hash(template: dict[str, Any]) -> str:
    serialized = json.dumps(
        template, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _normalize_grading_config(
    raw_config: Any, template: dict[str, Any]
) -> dict[str, Any]:
    if not isinstance(raw_config, dict) or raw_config.get("schema_version") != 1:
        raise ValueError(
            'The private spreadsheet grading workbook must be an object with "schema_version": 1.'
        )
    raw_sheets = raw_config.get("sheets", [])
    raw_source_sheets = raw_config.get("source_sheets", [])
    if not isinstance(raw_sheets, list) or not isinstance(raw_source_sheets, list):
        raise TypeError("Private spreadsheet grading sheets must be lists.")
    if not 1 <= len(raw_sheets) + len(raw_source_sheets) <= MAX_SHEETS:
        raise ValueError(
            f"The private spreadsheet grading workbook must contain 1 to {MAX_SHEETS} sheets."
        )

    public_by_name = {
        sheet.get("name", "").casefold(): sheet for sheet in template.get("sheets", [])
    }
    public_names = set(public_by_name)
    all_names: set[str] = set()
    normalized_sheets: list[dict[str, Any]] = []
    normalized_source_sheets: list[dict[str, Any]] = []
    total_addressable = 0
    total_populated = 0
    total_formulas = 0

    def normalize_sheets(
        source: list[Any], *, description: str, allow_public_names: bool
    ) -> list[dict[str, Any]]:
        nonlocal total_addressable, total_populated, total_formulas
        normalized: list[dict[str, Any]] = []
        for sheet_index, raw_sheet in enumerate(source, start=1):
            if not isinstance(raw_sheet, dict):
                raise TypeError(f"{description} {sheet_index} must be an object.")
            name = _normalize_sheet_name(
                raw_sheet.get("name"), f"{description} {sheet_index}"
            )
            folded_name = name.casefold()
            if not allow_public_names and folded_name in public_names:
                raise ValueError(
                    f'{description} "{name}" conflicts with a student sheet.'
                )
            public_sheet = public_by_name.get(folded_name)
            if allow_public_names and public_sheet and name != public_sheet["name"]:
                raise ValueError(
                    f'{description} "{name}" must use the exact student sheet name "{public_sheet["name"]}".'
                )
            if folded_name in all_names:
                raise ValueError(f'Private grading sheet name "{name}" is duplicated.')
            all_names.add(folded_name)

            rows = raw_sheet.get("rows")
            columns = raw_sheet.get("columns")
            if (
                isinstance(rows, bool)
                or not isinstance(rows, int)
                or not 1 <= rows <= MAX_ROWS
            ):
                raise ValueError(
                    f'{description} "{name}" rows must be between 1 and {MAX_ROWS}.'
                )
            if (
                isinstance(columns, bool)
                or not isinstance(columns, int)
                or not 1 <= columns <= MAX_COLUMNS
            ):
                raise ValueError(
                    f'{description} "{name}" columns must be between 1 and {MAX_COLUMNS}.'
                )
            if (
                allow_public_names
                and public_sheet
                and (rows < public_sheet["rows"] or columns < public_sheet["columns"])
            ):
                raise ValueError(
                    f'{description} "{name}" must cover its complete student range.'
                )
            total_addressable += rows * columns

            raw_cells = raw_sheet.get("cells", {})
            if not isinstance(raw_cells, dict):
                raise TypeError(f'{description} "{name}" cells must be an object.')
            cells: dict[str, str | float | bool] = {}
            for raw_address, value in raw_cells.items():
                if not isinstance(raw_address, str):
                    raise TypeError(
                        f'Cell addresses in {description.lower()} "{name}" must be strings.'
                    )
                address = raw_address.upper()
                position = _parse_address(address)
                if position is None or position[0] >= rows or position[1] >= columns:
                    raise ValueError(
                        f'Cell "{raw_address}" is outside {description.lower()} "{name}".'
                    )
                if address in cells:
                    raise ValueError(
                        f'Cell "{address}" is duplicated in {description.lower()} "{name}".'
                    )
                cells[address] = _normalize_cell_value(value, f"{name}!{address}")
                total_populated += 1
                if isinstance(value, str) and value.startswith("="):
                    total_formulas += 1
            normalized.append({
                "name": name,
                "rows": rows,
                "columns": columns,
                "cells": cells,
            })
        return normalized

    normalized_source_sheets = normalize_sheets(
        raw_source_sheets,
        description="Private source sheet",
        allow_public_names=True,
    )
    normalized_sheets = normalize_sheets(
        raw_sheets,
        description="Private grading sheet",
        allow_public_names=False,
    )

    if total_addressable > MAX_ADDRESSABLE_CELLS:
        raise ValueError(
            f"Private grading workbooks may contain at most {MAX_ADDRESSABLE_CELLS} addressable cells."
        )
    if total_populated > MAX_POPULATED_CELLS:
        raise ValueError(
            f"Private grading workbooks may contain at most {MAX_POPULATED_CELLS} populated cells."
        )
    if total_formulas > MAX_FORMULAS:
        raise ValueError(
            f"Private grading workbooks may contain at most {MAX_FORMULAS} formulas."
        )

    raw_outputs = raw_config.get("outputs")
    if (
        not isinstance(raw_outputs, dict)
        or not 1 <= len(raw_outputs) <= MAX_GRADING_OUTPUTS
    ):
        raise ValueError(
            f"Private spreadsheet grading workbooks must define 1 to {MAX_GRADING_OUTPUTS} outputs."
        )
    sheets_by_name = {
        sheet["name"]: sheet
        for sheet in [*normalized_source_sheets, *normalized_sheets]
    }
    outputs: dict[str, dict[str, str | bool]] = {}
    for output_name, raw_output in raw_outputs.items():
        if (
            not isinstance(output_name, str)
            or output_name.strip() != output_name
            or not 1 <= len(output_name) <= 128
        ):
            raise ValueError(
                "Private spreadsheet grading output names must be non-empty strings of at most 128 characters."
            )
        if not isinstance(raw_output, dict):
            raise TypeError(
                f'Private grading output "{output_name}" must be an object.'
            )
        sheet_name = raw_output.get("sheet")
        address_value = raw_output.get("cell")
        if not isinstance(sheet_name, str) or sheet_name not in sheets_by_name:
            raise ValueError(
                f'Private grading output "{output_name}" references an unknown private sheet.'
            )
        if not isinstance(address_value, str):
            raise TypeError(
                f'Private grading output "{output_name}" cell must be a string.'
            )
        address = address_value.upper()
        position = _parse_address(address)
        output_sheet = sheets_by_name[sheet_name]
        if (
            position is None
            or position[0] >= output_sheet["rows"]
            or position[1] >= output_sheet["columns"]
        ):
            raise ValueError(
                f'Private grading output "{output_name}" references a cell outside sheet "{sheet_name}".'
            )
        output: dict[str, str | bool] = {"sheet": sheet_name, "cell": address}
        if "required" in raw_output:
            required = raw_output["required"]
            if not isinstance(required, bool):
                raise TypeError(
                    f'Private grading output "{output_name}" required must be a boolean.'
                )
            output["required"] = required
        outputs[output_name] = output

    normalized: dict[str, Any] = {
        "schema_version": 1,
        "sheets": normalized_sheets,
        "outputs": outputs,
    }
    if raw_source_sheets:
        normalized["source_sheets"] = normalized_source_sheets
    normalized_size = len(
        json.dumps(
            normalized, ensure_ascii=False, separators=(",", ":"), sort_keys=True
        ).encode("utf-8")
    )
    if normalized_size > MAX_PAYLOAD_BYTES:
        raise ValueError(
            f"Private spreadsheet grading workbooks must be at most {MAX_PAYLOAD_BYTES} bytes."
        )
    return {**normalized, "grader_hash": _template_hash(normalized)}


def _source_path(child: lxml.html.HtmlElement, data: pl.QuestionData) -> pathlib.Path:
    directory = pl.get_string_attrib(child, "directory", ".")
    source_file = pl.get_string_attrib(child, "source-file")
    relative_path = pathlib.Path(source_file)
    if relative_path.is_absolute():
        raise ValueError('Spreadsheet attribute "source-file" must be relative.')
    if directory == "serverFilesCourse":
        base_value = data["options"].get("server_files_course_path")
    else:
        base_value = data["options"].get("question_path")
    if not isinstance(base_value, str):
        raise TypeError(f'Spreadsheet directory "{directory}" is unavailable.')
    base_path = pathlib.Path(base_value).resolve()
    file_path = (base_path / relative_path).resolve()
    if not file_path.is_relative_to(base_path):
        raise ValueError(
            'Spreadsheet attribute "source-file" may not leave its directory.'
        )
    if not file_path.is_file():
        raise ValueError(f'Unknown spreadsheet source file "{source_file}".')
    if file_path.suffix.lower() not in {".csv", ".tsv", ".xlsx"}:
        raise ValueError("Spreadsheet source files must use .csv, .tsv, or .xlsx.")
    return file_path


def _formula_nodes(node: pl.FormulaAstNode) -> list[pl.FormulaAstNode]:
    if isinstance(node, pl.FormulaFunctionNode):
        return list(node.arguments)
    if isinstance(node, pl.FormulaUnaryNode | pl.FormulaPostfixNode):
        return [node.operand]
    if isinstance(node, pl.FormulaBinaryNode):
        return [node.left, node.right]
    if isinstance(node, pl.FormulaGroupNode):
        return [node.expression]
    return []


def _reference_sheet_name(current_sheet: str, *sheet_names: str | None) -> str:
    qualified = {name.casefold(): name for name in sheet_names if name is not None}
    if len(qualified) > 1:
        raise ValueError("Spreadsheet ranges cannot span multiple sheets.")
    return next(iter(qualified.values()), current_sheet)


def _validate_visible_formula_references(
    template: dict[str, Any], source_sheets: list[dict[str, Any]]
) -> None:
    public_ranges: dict[str, tuple[str, pl.SpreadsheetAddressRange]] = {}
    for sheet in template.get("sheets", []):
        student_range = _parse_range(
            sheet.get(
                "student_range",
                f"A1:{_column_name(sheet['columns'] - 1)}{sheet['rows']}",
            )
        )
        if student_range is None:
            raise ValueError(f'Sheet "{sheet["name"]}" has an invalid student range.')
        public_ranges[sheet["name"].casefold()] = (sheet["name"], student_range)
    source_by_name = {sheet["name"].casefold(): sheet for sheet in source_sheets}

    def validate_reference(
        current_sheet: str,
        start: pl.FormulaReferenceEndpoint,
        end: pl.FormulaReferenceEndpoint | None = None,
    ) -> None:
        endpoints = (start,) if end is None else (start, end)
        sheet_name = _reference_sheet_name(
            current_sheet, *(endpoint.sheet for endpoint in endpoints)
        )
        public = public_ranges.get(sheet_name.casefold())
        source = source_by_name.get(sheet_name.casefold())
        if public is None or source is None:
            raise ValueError(
                f'Formula in student-visible sheet "{current_sheet}" references a non-visible sheet.'
            )
        student_range = public[1]
        if isinstance(start, pl.FormulaCellReference):
            cell_end = end if isinstance(end, pl.FormulaCellReference) else start
            referenced = pl.SpreadsheetAddressRange(
                pl.SpreadsheetAddress(
                    row=min(start.row, cell_end.row) - 1,
                    column=min(
                        _column_index(start.column), _column_index(cell_end.column)
                    ),
                ),
                pl.SpreadsheetAddress(
                    row=max(start.row, cell_end.row) - 1,
                    column=max(
                        _column_index(start.column), _column_index(cell_end.column)
                    ),
                ),
            )
        elif isinstance(start, pl.FormulaColumnReference):
            column_end = end if isinstance(end, pl.FormulaColumnReference) else start
            referenced = pl.SpreadsheetAddressRange(
                pl.SpreadsheetAddress(
                    row=0,
                    column=min(
                        _column_index(start.column), _column_index(column_end.column)
                    ),
                ),
                pl.SpreadsheetAddress(
                    row=source["rows"] - 1,
                    column=max(
                        _column_index(start.column), _column_index(column_end.column)
                    ),
                ),
            )
        else:
            row_end = end if isinstance(end, pl.FormulaRowReference) else start
            if not isinstance(start, pl.FormulaRowReference) or not isinstance(
                row_end, pl.FormulaRowReference
            ):
                raise TypeError("Spreadsheet formula range endpoints are incompatible.")
            referenced = pl.SpreadsheetAddressRange(
                pl.SpreadsheetAddress(row=min(start.row, row_end.row) - 1, column=0),
                pl.SpreadsheetAddress(
                    row=max(start.row, row_end.row) - 1,
                    column=source["columns"] - 1,
                ),
            )
        if not student_range.contains_range(referenced):
            raise ValueError(
                f'Formula in student-visible sheet "{current_sheet}" references a cell outside declared student ranges.'
            )

    for sheet in template.get("sheets", []):
        for value in sheet.get("cells", {}).values():
            if not isinstance(value, str) or not value.startswith("="):
                continue
            ast = pl.parse_spreadsheet_formula(value)
            pending = [ast.root]
            while pending:
                node = pending.pop()
                if isinstance(node, pl.FormulaReferenceNode):
                    validate_reference(sheet["name"], node.reference)
                elif isinstance(
                    node,
                    pl.FormulaCellRangeNode
                    | pl.FormulaColumnRangeNode
                    | pl.FormulaRowRangeNode,
                ):
                    validate_reference(sheet["name"], node.start, node.end)
                else:
                    pending.extend(_formula_nodes(node))


def _prepare_file_template(
    element: lxml.html.HtmlElement, data: pl.QuestionData, answer_name: str
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    data_children = element.xpath("./pl-spreadsheet-data")
    output_children = element.xpath("./pl-spreadsheet-output")
    loaded: dict[pathlib.Path, pl.SpreadsheetSourceBook] = {}
    added_files: set[pathlib.Path] = set()
    source_sheets: list[dict[str, Any]] = []
    source_by_name: dict[str, dict[str, Any]] = {}
    public_sheets: list[dict[str, Any]] = []

    def add_source(sheet: dict[str, Any]) -> None:
        folded_name = sheet["name"].casefold()
        if folded_name in source_by_name:
            raise ValueError(
                f'Spreadsheet source sheet "{sheet["name"]}" is duplicated.'
            )
        source_by_name[folded_name] = sheet
        source_sheets.append(sheet)

    for child in data_children:
        if child.text and child.text.strip():
            raise ValueError("pl-spreadsheet-data may not contain text.")
        file_path = _source_path(child, data)
        sheet_name = pl.get_string_attrib(child, "sheet-name")
        if file_path not in loaded:
            loaded[file_path] = pl.read_spreadsheet(file_path, sheet_name=sheet_name)
        source = loaded[file_path]
        source_file_sheets = source.get("sheets", [])
        if not isinstance(source_file_sheets, list):
            raise TypeError(
                "The spreadsheet source reader returned an invalid sheetbook."
            )
        selected_source: dict[str, Any]
        if file_path.suffix.lower() in {".csv", ".tsv"}:
            if file_path in added_files:
                raise ValueError(
                    f'Single-sheet source file "{file_path.name}" may be declared only once.'
                )
            selected_source = dict(source_file_sheets[0])
            selected_source.pop("editable_ranges", None)
            add_source(selected_source)
        else:
            selected = next(
                (
                    sheet
                    for sheet in source_file_sheets
                    if sheet.get("name") == sheet_name
                ),
                None,
            )
            if selected is None:
                raise ValueError(
                    f'XLSX source file "{file_path.name}" has no sheet named "{sheet_name}".'
                )
            if file_path not in added_files:
                for workbook_sheet in source_file_sheets:
                    normalized_source = dict(workbook_sheet)
                    normalized_source.pop("editable_ranges", None)
                    add_source(normalized_source)
            selected_source = source_by_name[sheet_name.casefold()]
        added_files.add(file_path)

        raw_student_range = pl.get_string_attrib(child, "student-range")
        student_range = _parse_range(raw_student_range)
        if student_range is None:
            raise ValueError(f'Invalid student range "{raw_student_range}".')
        selected_source["rows"] = max(
            selected_source["rows"], student_range.end_row + 1
        )
        selected_source["columns"] = max(
            selected_source["columns"], student_range.end_column + 1
        )

        editable_ranges: list[str] = []
        raw_editable_ranges = pl.get_string_attrib(child, "editable-ranges", "")
        for raw_range in raw_editable_ranges.split(","):
            if not raw_range.strip():
                continue
            editable_range = _parse_range(raw_range.strip())
            if editable_range is None or not student_range.contains_range(
                editable_range
            ):
                raise ValueError(
                    f'Editable range "{raw_range.strip()}" is outside student range "{student_range.address}".'
                )
            editable_ranges.append(editable_range.address)

        public_sheets.append({
            "name": sheet_name,
            "rows": student_range.end_row + 1,
            "columns": student_range.end_column + 1,
            "cells": {
                address: value
                for address, value in selected_source["cells"].items()
                if (position := _parse_address(address)) is not None
                and student_range.contains_cell(*position)
            },
            "editable_ranges": editable_ranges,
            "student_range": student_range.address,
        })

    template = _normalize_template({"schema_version": 1, "sheets": public_sheets})
    _validate_visible_formula_references(template, source_sheets)

    raw_grading_config = data["correct_answers"].get(answer_name)
    if raw_grading_config is not None and not isinstance(raw_grading_config, dict):
        raise TypeError(
            f'data["correct_answers"]["{answer_name}"] must be a spreadsheet grading object.'
        )
    if raw_grading_config is None and not output_children:
        return template, None

    grading_config = dict(raw_grading_config or {})
    grading_config["schema_version"] = 1
    grading_config["source_sheets"] = [
        *grading_config.get("source_sheets", []),
        *source_sheets,
    ]
    grading_config.setdefault("sheets", [])
    outputs = dict(grading_config.get("outputs", {}))
    for child in output_children:
        if child.text and child.text.strip():
            raise ValueError("pl-spreadsheet-output may not contain text.")
        output_name = pl.get_string_attrib(child, "name")
        if output_name in outputs:
            raise ValueError(
                f'Spreadsheet grading output "{output_name}" is duplicated.'
            )
        output: dict[str, str | bool] = {
            "sheet": pl.get_string_attrib(child, "sheet-name"),
            "cell": pl.get_string_attrib(child, "cell"),
        }
        if pl.has_attrib(child, "required"):
            output["required"] = pl.get_boolean_attrib(child, "required")
        outputs[output_name] = output
    grading_config["outputs"] = outputs
    return template, _normalize_grading_config(grading_config, template)


def _get_config(
    element: lxml.html.HtmlElement, data: pl.QuestionData
) -> tuple[str, dict[str, Any]]:
    answer_name = pl.get_string_attrib(element, "answers-name")
    configs = data["params"].get("_pl_spreadsheet_v1", {})
    config = configs.get(answer_name, {}) if isinstance(configs, dict) else {}
    return answer_name, config


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.validate_element_tree(element, SCHEMA_MANIFEST_PATH)

    answer_name = pl.get_string_attrib(element, "answers-name")
    params_name = pl.get_string_attrib(element, "params-name", None)
    data_children = element.xpath("./pl-spreadsheet-data")
    output_children = element.xpath("./pl-spreadsheet-output")
    pl.check_answers_names(data, answer_name)

    if params_name is not None:
        if data_children or output_children:
            raise ValueError(
                'Attribute "params-name" cannot be combined with pl-spreadsheet-data or pl-spreadsheet-output children.'
            )
        if params_name not in data["params"]:
            raise ValueError(f'No value was found in data["params"]["{params_name}"].')
        template = _normalize_template(data["params"].get(params_name))
        raw_grading_config = data["correct_answers"].get(answer_name)
        if raw_grading_config is not None:
            data["correct_answers"][answer_name] = _normalize_grading_config(
                raw_grading_config, template
            )
    else:
        if not data_children:
            raise ValueError(
                'pl-spreadsheet requires either "params-name" or at least one pl-spreadsheet-data child.'
            )
        template, grading_config = _prepare_file_template(element, data, answer_name)
        if grading_config is not None:
            data["correct_answers"][answer_name] = grading_config
    height = pl.get_string_attrib(element, "height", DEFAULT_HEIGHT)
    if not CSS_SIZE_RE.fullmatch(height.strip()):
        raise ValueError(
            'Attribute "height" must be 0 or a non-negative CSS size such as "500px" or "40rem".'
        )

    configs = data["params"].get("_pl_spreadsheet_v1", {})
    if not isinstance(configs, dict):
        configs = {}
    configs[answer_name] = {
        "schema_version": 1,
        "template_hash": _template_hash(template),
        "template": template,
        "allow_blank": pl.get_boolean_attrib(
            element, "allow-blank", DEFAULT_ALLOW_BLANK
        ),
        "aria_label": pl.get_string_attrib(element, "aria-label", DEFAULT_ARIA_LABEL),
        "height": height,
    }
    data["params"]["_pl_spreadsheet_v1"] = configs


def _input_value(cell: dict[str, Any]) -> Any:
    cell_input = cell.get("input", {})
    return cell_input.get("value") if isinstance(cell_input, dict) else None


def _result_value(cell: dict[str, Any]) -> str:
    result = cell.get("result", {})
    if not isinstance(result, dict) or result.get("type", "empty") == "empty":
        return ""
    value = result.get("value", "")
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    return str(value)


def _student_range(sheet: dict[str, Any]) -> pl.SpreadsheetAddressRange:
    range_text = sheet.get("student_range")
    if isinstance(range_text, str):
        parsed = _parse_range(range_text)
        if parsed is not None:
            return parsed
    return pl.SpreadsheetAddressRange(
        pl.SpreadsheetAddress(row=0, column=0),
        pl.SpreadsheetAddress(
            row=sheet.get("rows", 1) - 1,
            column=sheet.get("columns", 1) - 1,
        ),
    )


def _table_data(config: dict[str, Any], snapshot: Any) -> list[dict[str, Any]]:
    snapshot_sheets = {}
    if isinstance(snapshot, dict):
        for sheet in snapshot.get("sheets", []):
            if isinstance(sheet, dict) and isinstance(sheet.get("name"), str):
                snapshot_sheets[sheet["name"]] = sheet

    table_sheets = []
    template = config.get("template", {})
    for sheet in template.get("sheets", []):
        snapshot_sheet = snapshot_sheets.get(sheet.get("name"), {})
        snapshot_cells = snapshot_sheet.get("cells", {})
        template_cells = sheet.get("cells", {})
        student_range = _student_range(sheet)
        rows = []
        for row_index in range(student_range.start_row, student_range.end_row + 1):
            cells = []
            for column_index in range(
                student_range.start_column, student_range.end_column + 1
            ):
                address = f"{_column_name(column_index)}{row_index + 1}"
                snapshot_cell = snapshot_cells.get(address)
                if isinstance(snapshot_cell, dict):
                    display = _result_value(snapshot_cell)
                else:
                    display = str(template_cells.get(address, ""))
                cells.append({"address": address, "display": display})
            rows.append({"number": row_index + 1, "cells": cells})
        table_sheets.append({
            "name": sheet.get("name", "Spreadsheet"),
            "columns": [
                {"name": _column_name(index)}
                for index in range(
                    student_range.start_column, student_range.end_column + 1
                )
            ],
            "rows": rows,
        })
    return table_sheets


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    answer_name, config = _get_config(element, data)
    snapshot = data["submitted_answers"].get(answer_name)
    format_errors = data["format_errors"].get(answer_name, [])
    if isinstance(format_errors, str):
        format_errors = [format_errors]

    render_data: dict[str, Any] = {
        "uuid": pl.get_uuid(),
        "answer_name": answer_name,
        "aria_label": config.get("aria_label", DEFAULT_ARIA_LABEL),
        "height": config.get("height", DEFAULT_HEIGHT),
        "format_errors": format_errors,
    }

    if data["panel"] == "answer":
        render_data["answer"] = True
    elif data["panel"] == "question" and data["editable"]:
        initial_submission = json.dumps(
            {
                "schema_version": 1,
                "template_hash": config.get("template_hash", ""),
                "sheets": {},
            },
            separators=(",", ":"),
        )
        raw_submission = data["raw_submitted_answers"].get(answer_name)
        if isinstance(raw_submission, str):
            try:
                parsed_raw = json.loads(raw_submission)
                if isinstance(parsed_raw, dict) and parsed_raw.get(
                    "template_hash"
                ) == config.get("template_hash"):
                    initial_submission = raw_submission
            except ValueError:
                pass
        options = {
            "uuid": render_data["uuid"],
            "answer_name": answer_name,
            "aria_label": config.get("aria_label", DEFAULT_ARIA_LABEL),
            "height": config.get("height", DEFAULT_HEIGHT),
            "config": config,
            "initial_submission": json.loads(initial_submission),
        }
        render_data.update({
            "editable": True,
            "options": base64.b64encode(
                json.dumps(options, separators=(",", ":")).encode("utf-8")
            ).decode("ascii"),
            "initial_submission": initial_submission,
        })
    else:
        render_data["read_only"] = True
        render_data["sheets"] = _table_data(config, snapshot)

    with open("pl-spreadsheet.mustache", encoding="utf-8") as template_file:
        return chevron.render(template_file, render_data).strip()


def _is_editable(config: dict[str, Any], sheet_name: str, address: str) -> bool:
    position = _parse_address(address)
    if position is None:
        return False
    for sheet in config.get("template", {}).get("sheets", []):
        if sheet.get("name") != sheet_name:
            continue
        for range_text in sheet.get("editable_ranges", []):
            parsed_range = _parse_range(range_text)
            if parsed_range is None:
                continue
            if parsed_range.contains_cell(*position):
                return True
    return False


def _add_format_error(data: pl.QuestionData, answer_name: str, message: str) -> None:
    errors = data["format_errors"].get(answer_name, [])
    if not isinstance(errors, list):
        errors = [str(errors)]
    errors.append(message)
    data["format_errors"][answer_name] = errors


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    answer_name, config = _get_config(element, data)
    submission = data["submitted_answers"].get(answer_name)
    if not isinstance(submission, dict):
        _add_format_error(data, answer_name, "No spreadsheet answer was submitted.")
        return
    submission_error = submission.get("error")
    if isinstance(submission_error, str):
        _add_format_error(data, answer_name, submission_error)
        return
    if submission.get("schema_version") != 1:
        _add_format_error(
            data, answer_name, "The spreadsheet answer has an invalid version."
        )
        return
    if submission.get("template_hash") != config.get("template_hash"):
        _add_format_error(
            data,
            answer_name,
            "The spreadsheet template changed. Reload the question and try again.",
        )
        return
    engine = submission.get("engine", {})
    if not isinstance(engine, dict) or engine.get("name") != "hyperformula":
        _add_format_error(
            data, answer_name, "The spreadsheet answer was not normalized."
        )
        return
    sheets = submission.get("sheets")
    if not isinstance(sheets, list):
        _add_format_error(
            data, answer_name, "The spreadsheet answer has an invalid structure."
        )
        return

    if not config.get("allow_blank", DEFAULT_ALLOW_BLANK):
        has_editable_range = any(
            sheet.get("editable_ranges")
            for sheet in config.get("template", {}).get("sheets", [])
        )
        has_editable_input = False
        for sheet in sheets:
            if not isinstance(sheet, dict) or not isinstance(sheet.get("cells"), dict):
                continue
            sheet_name = sheet.get("name")
            if not isinstance(sheet_name, str):
                continue
            for address, cell in sheet["cells"].items():
                if (
                    isinstance(address, str)
                    and isinstance(cell, dict)
                    and _is_editable(config, sheet_name, address)
                    and _input_value(cell) not in (None, "")
                ):
                    has_editable_input = True
                    break
        if has_editable_range and not has_editable_input:
            _add_format_error(
                data, answer_name, "The spreadsheet answer may not be blank."
            )


def _first_editable_cell(config: dict[str, Any]) -> tuple[str, str]:
    for sheet in config.get("template", {}).get("sheets", []):
        ranges = sheet.get("editable_ranges", [])
        if ranges:
            parsed_range = _parse_range(ranges[0])
            if parsed_range is not None:
                return sheet["name"], (
                    f"{_column_name(parsed_range.start_column)}"
                    f"{parsed_range.start_row + 1}"
                )
    raise ValueError("The spreadsheet has no editable cell.")


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    answer_name, config = _get_config(element, data)
    if data["test_type"] == "invalid":
        data["raw_submitted_answers"][answer_name] = "not valid json"
        return
    sheet_name, address = _first_editable_cell(config)
    data["raw_submitted_answers"][answer_name] = json.dumps(
        {
            "schema_version": 1,
            "template_hash": config.get("template_hash", ""),
            "sheets": {sheet_name: {address: f"Test {data['test_type']}"}},
        },
        separators=(",", ":"),
    )
