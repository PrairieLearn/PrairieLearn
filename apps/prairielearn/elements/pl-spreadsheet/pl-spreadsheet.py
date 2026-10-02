from __future__ import annotations

import base64
import hashlib
import json
import math
import pathlib
import re
from dataclasses import dataclass
from typing import Any, Literal

import chevron
import lxml.html
import prairielearn as pl
import prairielearn.spreadsheet_utils as psp

SCHEMA_MANIFEST_PATH = pathlib.Path(__file__).parent / "schema.json"

DEFAULT_ARIA_LABEL = "Spreadsheet"
DEFAULT_HEIGHT = "500px"
DEFAULT_ALLOW_BLANK = False
DEFAULT_WEIGHT = 1

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
MAX_PARAMETER_RANGES = 100
MAX_TEST_CASES = 50
MAX_TEST_CASE_INPUTS = 100
MAX_REFERENCE_CELLS = 500
MAX_GRADING_RESULTS = 5000
DEFAULT_RTOL = 1e-2
DEFAULT_ATOL = 1e-8
INTERNAL_SHEET_PREFIX = "__PL_STUDENT_"

CELL_ADDRESS_RE = re.compile(r"^([A-Z]+)([1-9][0-9]*)$")
BLOCKED_SHEET_NAME_CHARACTERS = frozenset("!:<>{}[]\0")
CSS_SIZE_RE = re.compile(
    r"^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|vh|vw|vmin|vmax|%))$",
    re.IGNORECASE,
)
# Mirrors HyperFormula's identifier characters so that every name the engine could
# parse as a function is checked as one whole token.
FUNCTION_RE = re.compile(
    r"(?<![A-Za-z\u00C0-\u02AF0-9_.])([A-Za-z\u00C0-\u02AF0-9_.]+)\s*\("
)

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


def _parse_range(
    range_text: str, bounds: psp.AddressRange | None = None
) -> psp.AddressRange | None:
    try:
        return psp.AddressRange.from_a1(range_text, bounds=bounds)
    except (TypeError, ValueError):
        return None


def _strip_formula_strings(formula: str) -> tuple[str, list[str]]:
    """
    Blank string literals and quoted sheet names so that their contents cannot hide
    function calls.

    Returns:
        The blanked formula and the quoted sheet names it contains.
    """
    result: list[str] = []
    quoted_sheet_names: list[str] = []
    quoted: list[str] = []
    quote: str | None = None
    index = 0
    while index < len(formula):
        character = formula[index]
        if quote is None:
            if character in "\"'":
                quote = character
                quoted = []
                result.append(" ")
            else:
                result.append(character)
        elif character == quote:
            # Both quote styles escape an embedded quote by doubling it.
            if index + 1 < len(formula) and formula[index + 1] == quote:
                quoted.append(quote)
                result.extend((" ", " "))
                index += 2
                continue
            if quote == "'":
                quoted_sheet_names.append("".join(quoted))
            quote = None
            result.append(" ")
        else:
            quoted.append(character)
            result.append(" ")
        index += 1
    return "".join(result), quoted_sheet_names


def _validate_formula(formula: str, location: str) -> None:
    if len(formula) > MAX_FORMULA_LENGTH:
        raise ValueError(
            f"Formula in {location} exceeds the {MAX_FORMULA_LENGTH}-character limit."
        )
    source, quoted_sheet_names = _strip_formula_strings(formula)
    if any(character in source for character in "[{}]") or any(
        "[" in name or "]" in name for name in quoted_sheet_names
    ):
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
    if value.casefold().startswith(INTERNAL_SHEET_PREFIX.casefold()):
        raise ValueError(
            f'{description} may not begin with the reserved prefix "{INTERNAL_SHEET_PREFIX}".'
        )
    return value


def _normalize_template(raw_template: Any) -> dict[str, Any]:
    if not isinstance(raw_template, dict) or raw_template.get("schema_version") != 2:
        raise ValueError(
            'The spreadsheet template must be an object with "schema_version": 2.'
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

        sheet_range = psp.AddressRange(
            psp.Address(row=0, column=0),
            psp.Address(row=rows - 1, column=columns - 1),
        )
        raw_student_range = raw_sheet.get("student_range")
        if raw_student_range is None:
            student_range = sheet_range
        elif not isinstance(raw_student_range, str):
            raise TypeError(f'Sheet "{name}" student_range must be a string.')
        else:
            student_range = _parse_range(raw_student_range, sheet_range)
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
            parsed_range = _parse_range(raw_range, student_range)
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
    return {"schema_version": 2, "sheets": normalized_sheets}


def _content_hash(value: Any) -> str:
    serialized = json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _normalize_grading_config(
    raw_config: Any, template: dict[str, Any]
) -> dict[str, Any]:
    if not isinstance(raw_config, dict) or raw_config.get("schema_version") != 2:
        raise ValueError(
            'The private spreadsheet grading workbook must be an object with "schema_version": 2.'
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

    raw_student_overlays = raw_config.get("student_overlays", [])
    if not isinstance(raw_student_overlays, list):
        raise TypeError("Private spreadsheet student overlays must be a list.")
    source_by_name = {sheet["name"]: sheet for sheet in normalized_source_sheets}
    student_overlays: list[dict[str, str]] = []
    overlaid_students: set[str] = set()
    for overlay_index, raw_overlay in enumerate(raw_student_overlays, start=1):
        if not isinstance(raw_overlay, dict):
            raise TypeError(f"Student overlay {overlay_index} must be an object.")
        student_sheet = raw_overlay.get("student_sheet")
        source_sheet = raw_overlay.get("source_sheet")
        source_range_text = raw_overlay.get("source_range")
        if not isinstance(student_sheet, str) or student_sheet not in {
            sheet["name"] for sheet in template["sheets"]
        }:
            raise ValueError(
                f"Student overlay {overlay_index} references an unknown student sheet."
            )
        if student_sheet in overlaid_students:
            raise ValueError(f'Student sheet "{student_sheet}" has multiple overlays.')
        if not isinstance(source_sheet, str) or source_sheet not in source_by_name:
            raise ValueError(
                f"Student overlay {overlay_index} references an unknown source sheet."
            )
        if not isinstance(source_range_text, str):
            raise TypeError(f"Student overlay {overlay_index} range must be a string.")
        source_range = _parse_range(source_range_text)
        source = source_by_name[source_sheet]
        student = next(
            sheet for sheet in template["sheets"] if sheet["name"] == student_sheet
        )
        if (
            source_range is None
            or source_range.end_row >= source["rows"]
            or source_range.end_column >= source["columns"]
            or source_range.shape != (student["rows"], student["columns"])
        ):
            raise ValueError(
                f'Student overlay for "{student_sheet}" must be an in-bounds source range with the same shape as the student sheet.'
            )
        overlaid_students.add(student_sheet)
        student_overlays.append({
            "student_sheet": student_sheet,
            "source_sheet": source_sheet,
            "source_range": source_range.address,
        })
    expected_students = {sheet["name"] for sheet in template["sheets"]}
    if overlaid_students != expected_students:
        missing = sorted(expected_students - overlaid_students)
        raise ValueError(
            f"Private spreadsheet grading configuration is missing overlays for: {', '.join(missing)}."
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

    raw_outputs = raw_config.get("outputs", {})
    min_outputs = 0 if raw_config.get("reference") is not None else 1
    if (
        not isinstance(raw_outputs, dict)
        or not min_outputs <= len(raw_outputs) <= MAX_GRADING_OUTPUTS
    ):
        raise ValueError(
            f"Private spreadsheet grading workbooks must define 1 to {MAX_GRADING_OUTPUTS} outputs, or a reference solution."
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
        "schema_version": 2,
        "sheets": normalized_sheets,
        "student_overlays": student_overlays,
        "outputs": outputs,
    }
    if raw_source_sheets:
        normalized["source_sheets"] = normalized_source_sheets
    normalized.update(
        _normalize_testing_config(
            raw_config,
            template,
            normalized_source_sheets,
            student_overlays,
            output_count=len(outputs),
        )
    )
    normalized_size = len(
        json.dumps(
            normalized, ensure_ascii=False, separators=(",", ":"), sort_keys=True
        ).encode("utf-8")
    )
    if normalized_size > MAX_PAYLOAD_BYTES:
        raise ValueError(
            f"Private spreadsheet grading workbooks must be at most {MAX_PAYLOAD_BYTES} bytes."
        )
    return {**normalized, "grader_hash": _content_hash(normalized)}


@dataclass(frozen=True)
class _SourceCell:
    """A source-coordinate cell and the student-relative cell it mirrors, if any."""

    sheet: dict[str, Any]
    address: str
    position: tuple[int, int]
    student_sheet: dict[str, Any] | None
    student_position: tuple[int, int] | None

    @property
    def key(self) -> str:
        return f"{self.sheet['name']}!{self.address}"


def _split_qualified(value: Any, description: str) -> tuple[str, str]:
    if not isinstance(value, str) or "!" not in value:
        raise ValueError(
            f'{description} must be a sheet-qualified address such as "Inputs!B2".'
        )
    sheet_text, local_text = value.rsplit("!", 1)
    try:
        sheet_name = psp.QualifiedAddress.from_a1(f"{sheet_text}!A1").sheet_name
    except ValueError as exc:
        raise ValueError(f'{description} "{value}" has an invalid sheet name.') from exc
    return sheet_name, local_text.upper()


def _cell_is_editable(sheet: dict[str, Any], row: int, column: int) -> bool:
    return any(
        (parsed_range := _parse_range(range_text)) is not None
        and parsed_range.contains_cell(row, column)
        for range_text in sheet["editable_ranges"]
    )


def _is_formula(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("=")


def _normalize_tolerance(value: Any, description: str) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or value < 0
    ):
        raise ValueError(f"{description} must be a non-negative finite number.")
    return float(value)


def _normalize_testing_config(
    raw_config: dict[str, Any],
    template: dict[str, Any],
    source_sheets: list[dict[str, Any]],
    student_overlays: list[dict[str, str]],
    *,
    output_count: int,
) -> dict[str, Any]:
    """Normalize parameters, hidden test cases, and the reference solution."""
    # All addresses are authored in source coordinates. Reference formulas are
    # rebased into student-relative coordinates so that the server evaluates
    # them exactly like a submission.
    source_by_name = {sheet["name"].casefold(): sheet for sheet in source_sheets}
    template_by_name = {sheet["name"]: sheet for sheet in template["sheets"]}
    overlay_by_source: dict[str, tuple[dict[str, Any], psp.AddressRange]] = {}
    for overlay in student_overlays:
        source_range = _parse_range(overlay["source_range"])
        assert source_range is not None
        overlay_by_source[overlay["source_sheet"]] = (
            template_by_name[overlay["student_sheet"]],
            source_range,
        )

    def resolve(sheet_name: str, address: str, description: str) -> _SourceCell:
        sheet = source_by_name.get(sheet_name.casefold())
        position = _parse_address(address)
        if (
            sheet is None
            or position is None
            or position[0] >= sheet["rows"]
            or position[1] >= sheet["columns"]
        ):
            raise ValueError(
                f'{description} references unknown cell "{sheet_name}!{address}".'
            )
        overlay = overlay_by_source.get(sheet["name"])
        if overlay is None or not overlay[1].contains_cell(*position):
            return _SourceCell(sheet, address, position, None, None)
        student_sheet, source_range = overlay
        return _SourceCell(
            sheet,
            address,
            position,
            student_sheet,
            (
                position[0] - source_range.start_row,
                position[1] - source_range.start_column,
            ),
        )

    normalized: dict[str, Any] = {}

    raw_parameters = raw_config.get("parameters", [])
    if (
        not isinstance(raw_parameters, list)
        or len(raw_parameters) > MAX_PARAMETER_RANGES
    ):
        raise ValueError(
            f"Spreadsheet parameters must be a list of at most {MAX_PARAMETER_RANGES} ranges."
        )
    parameter_keys: set[str] = set()
    parameters: list[dict[str, str]] = []
    for raw_parameter in raw_parameters:
        sheet_name, range_text = _split_qualified(
            raw_parameter, "Spreadsheet parameter range"
        )
        sheet = source_by_name.get(sheet_name.casefold())
        overlay = overlay_by_source.get(sheet["name"]) if sheet else None
        parameter_range = (
            _parse_range(range_text, overlay[1]) if overlay is not None else None
        )
        if (
            sheet is None
            or parameter_range is None
            or overlay is None
            or not overlay[1].contains_range(parameter_range)
        ):
            raise ValueError(
                f'Spreadsheet parameter range "{raw_parameter}" must be inside a student range.'
            )
        parameters.append({"sheet": sheet["name"], "range": parameter_range.address})
        parameter_keys.update(
            f"{sheet['name']}!{_column_name(column)}{row + 1}"
            for row in range(parameter_range.start_row, parameter_range.end_row + 1)
            for column in range(
                parameter_range.start_column, parameter_range.end_column + 1
            )
        )
    if parameters:
        normalized["parameters"] = parameters

    def is_overridable(cell: _SourceCell) -> bool:
        if cell.key in parameter_keys:
            return True
        if cell.student_sheet is None or cell.student_position is None:
            return not _is_formula(cell.sheet["cells"].get(cell.address))
        row, column = cell.student_position
        if _cell_is_editable(cell.student_sheet, row, column):
            return False
        return not _is_formula(
            cell.student_sheet["cells"].get(f"{_column_name(column)}{row + 1}")
        )

    raw_cases = raw_config.get("test_cases", [])
    if not isinstance(raw_cases, list) or len(raw_cases) > MAX_TEST_CASES:
        raise ValueError(
            f"Spreadsheet test cases must be a list of at most {MAX_TEST_CASES} cases."
        )
    case_names: set[str] = set()
    test_cases: list[dict[str, Any]] = []
    for case_index, raw_case in enumerate(raw_cases, start=1):
        if not isinstance(raw_case, dict) or set(raw_case) - {"name", "inputs"}:
            raise ValueError(
                f'Spreadsheet test case {case_index} must be an object with "inputs" and an optional "name".'
            )
        name = raw_case.get("name", f"Case {case_index}")
        if (
            not isinstance(name, str)
            or name.strip() != name
            or not 1 <= len(name) <= 128
        ):
            raise ValueError(
                f"Spreadsheet test case {case_index} name must be a non-empty string of at most 128 characters."
            )
        if name in case_names:
            raise ValueError(f'Spreadsheet test case name "{name}" is duplicated.')
        case_names.add(name)
        raw_inputs = raw_case.get("inputs")
        if not isinstance(raw_inputs, dict) or len(raw_inputs) > MAX_TEST_CASE_INPUTS:
            raise ValueError(
                f'Spreadsheet test case "{name}" inputs must map at most {MAX_TEST_CASE_INPUTS} cells to values.'
            )
        input_keys: set[str] = set()
        inputs: list[dict[str, Any]] = []
        for raw_address, raw_value in raw_inputs.items():
            description = f'Spreadsheet test case "{name}"'
            cell = resolve(*_split_qualified(raw_address, description), description)
            if cell.key in input_keys:
                raise ValueError(f'{description} sets "{cell.key}" more than once.')
            input_keys.add(cell.key)
            value = (
                None
                if raw_value is None
                else _normalize_cell_value(raw_value, f"{cell.key} in {description}")
            )
            if _is_formula(value):
                raise ValueError(
                    f'{description} must set "{cell.key}" to a constant, not a formula.'
                )
            if not is_overridable(cell):
                raise ValueError(
                    f'{description} cannot override "{cell.key}". Only locked constant cells and declared parameter cells may be overridden.'
                )
            inputs.append({
                "sheet": cell.sheet["name"],
                "cell": cell.address,
                "value": value,
            })
        test_cases.append({"name": name, "inputs": inputs})
    if test_cases:
        normalized["test_cases"] = test_cases

    raw_reference = raw_config.get("reference")
    reference_count = 0
    compare_outputs = False
    if raw_reference is not None:
        if not isinstance(raw_reference, dict) or set(raw_reference) - {
            "cells",
            "rtol",
            "atol",
            "compare_outputs",
        }:
            raise ValueError(
                'The spreadsheet reference solution must be an object with "cells" and optional "rtol", "atol", and "compare_outputs".'
            )
        raw_cells = raw_reference.get("cells")
        if (
            not isinstance(raw_cells, dict)
            or not 1 <= len(raw_cells) <= MAX_REFERENCE_CELLS
        ):
            raise ValueError(
                f"The spreadsheet reference solution must define 1 to {MAX_REFERENCE_CELLS} cells."
            )
        compare_outputs = raw_reference.get("compare_outputs", False)
        if not isinstance(compare_outputs, bool):
            raise TypeError("Spreadsheet reference compare_outputs must be a boolean.")

        address_spaces = psp.AddressSpaceMap({
            overlay["student_sheet"]: overlay["source_range"]
            for overlay in student_overlays
        })
        visible_sheets = [
            {
                "name": overlay["student_sheet"],
                "rows": template_by_name[overlay["student_sheet"]]["rows"],
                "columns": template_by_name[overlay["student_sheet"]]["columns"],
                "student_range": overlay["source_range"],
            }
            for overlay in student_overlays
        ]
        reference_keys: set[str] = set()
        reference_cells: list[dict[str, Any]] = []
        for raw_address, raw_cell in raw_cells.items():
            description = "Spreadsheet reference cell"
            cell = resolve(*_split_qualified(raw_address, description), description)
            if cell.student_sheet is None or cell.student_position is None:
                raise ValueError(
                    f'Spreadsheet reference cell "{cell.key}" must be inside a student range.'
                )
            if not _cell_is_editable(cell.student_sheet, *cell.student_position):
                raise ValueError(
                    f'Spreadsheet reference cell "{cell.key}" must be editable.'
                )
            if cell.key in parameter_keys:
                raise ValueError(
                    f'Spreadsheet reference cell "{cell.key}" cannot also be a parameter.'
                )
            if cell.key in reference_keys:
                raise ValueError(
                    f'Spreadsheet reference cell "{cell.key}" is duplicated.'
                )
            reference_keys.add(cell.key)

            options = raw_cell if isinstance(raw_cell, dict) else {"value": raw_cell}
            if "value" not in options or set(options) - {"value", "rtol", "atol"}:
                raise ValueError(
                    f'Spreadsheet reference cell "{cell.key}" must be a value or an object with "value" and optional "rtol" and "atol".'
                )
            value = _normalize_cell_value(options["value"], cell.key)
            student_sheet_name = cell.student_sheet["name"]
            if _is_formula(value):
                assert isinstance(value, str)
                _validate_visible_formula_references(
                    {
                        "sheets": [
                            {
                                **sheet,
                                "cells": {cell.address: value}
                                if sheet["name"] == student_sheet_name
                                else {},
                            }
                            for sheet in visible_sheets
                        ]
                    },
                    source_sheets,
                )
                value = psp.rebase_spreadsheet_formula(
                    value,
                    current_sheet=student_sheet_name,
                    address_spaces=address_spaces,
                )
            normalized_cell: dict[str, Any] = {
                "sheet": cell.sheet["name"],
                "cell": cell.address,
                "input": value,
            }
            for tolerance in ("rtol", "atol"):
                if tolerance in options:
                    normalized_cell[tolerance] = _normalize_tolerance(
                        options[tolerance], f'Reference cell "{cell.key}" {tolerance}'
                    )
            reference_cells.append(normalized_cell)
        reference_count = len(reference_cells)
        normalized["reference"] = {
            "cells": reference_cells,
            "rtol": _normalize_tolerance(
                raw_reference.get("rtol", DEFAULT_RTOL), "Spreadsheet reference rtol"
            ),
            "atol": _normalize_tolerance(
                raw_reference.get("atol", DEFAULT_ATOL), "Spreadsheet reference atol"
            ),
            "compare_outputs": compare_outputs,
        }

    comparisons = reference_count + (output_count if compare_outputs else 0)
    if (1 + len(test_cases)) * (output_count + 2 * comparisons) > MAX_GRADING_RESULTS:
        raise ValueError(
            f"Spreadsheet grading may export at most {MAX_GRADING_RESULTS} results across all test cases."
        )
    return normalized


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


def _formula_nodes(node: psp.FormulaAstNode) -> list[psp.FormulaAstNode]:
    if isinstance(node, psp.FormulaFunctionNode):
        return list(node.arguments)
    if isinstance(node, psp.FormulaUnaryNode | psp.FormulaPostfixNode):
        return [node.operand]
    if isinstance(node, psp.FormulaBinaryNode):
        return [node.left, node.right]
    if isinstance(node, psp.FormulaGroupNode):
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
    public_ranges: dict[str, tuple[str, psp.AddressRange]] = {}
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
        start: psp.FormulaReferenceEndpoint,
        end: psp.FormulaReferenceEndpoint | None = None,
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
        if isinstance(start, psp.FormulaCellReference):
            cell_end = end if isinstance(end, psp.FormulaCellReference) else start
            referenced = psp.AddressRange(
                psp.Address(
                    row=min(start.row, cell_end.row) - 1,
                    column=min(
                        _column_index(start.column), _column_index(cell_end.column)
                    ),
                ),
                psp.Address(
                    row=max(start.row, cell_end.row) - 1,
                    column=max(
                        _column_index(start.column), _column_index(cell_end.column)
                    ),
                ),
            )
        elif isinstance(start, psp.FormulaColumnReference):
            column_end = end if isinstance(end, psp.FormulaColumnReference) else start
            referenced = psp.AddressRange(
                psp.Address(
                    row=0,
                    column=min(
                        _column_index(start.column), _column_index(column_end.column)
                    ),
                ),
                psp.Address(
                    row=source["rows"] - 1,
                    column=max(
                        _column_index(start.column), _column_index(column_end.column)
                    ),
                ),
            )
        else:
            row_end = end if isinstance(end, psp.FormulaRowReference) else start
            if not isinstance(start, psp.FormulaRowReference) or not isinstance(
                row_end, psp.FormulaRowReference
            ):
                raise TypeError("Spreadsheet formula range endpoints are incompatible.")
            referenced = psp.AddressRange(
                psp.Address(row=min(start.row, row_end.row) - 1, column=0),
                psp.Address(
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
            ast = psp.parse_spreadsheet_formula(value)
            pending = [ast.root]
            while pending:
                node = pending.pop()
                if isinstance(node, psp.FormulaReferenceNode):
                    validate_reference(sheet["name"], node.reference)
                elif isinstance(
                    node,
                    psp.FormulaCellRangeNode
                    | psp.FormulaColumnRangeNode
                    | psp.FormulaRowRangeNode,
                ):
                    validate_reference(sheet["name"], node.start, node.end)
                else:
                    pending.extend(_formula_nodes(node))


def _student_relative_template(
    source_template: dict[str, Any], source_sheets: list[dict[str, Any]]
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Crop source-coordinate sheets into A1-relative student worksheets."""
    _validate_visible_formula_references(source_template, source_sheets)
    address_spaces = psp.AddressSpaceMap({
        sheet["name"]: sheet.get(
            "student_range",
            f"A1:{_column_name(sheet['columns'] - 1)}{sheet['rows']}",
        )
        for sheet in source_template["sheets"]
    })
    student_sheets: list[dict[str, Any]] = []
    overlays: list[dict[str, str]] = []
    for sheet in source_template["sheets"]:
        name = sheet["name"]
        address_space = address_spaces[name]
        rows, columns = address_space.shape
        cells: dict[str, str | float | bool] = {}
        for source_address, value in sheet["cells"].items():
            student_address = address_space.to_student_address(source_address).address
            cells[student_address] = (
                psp.rebase_spreadsheet_formula(
                    value,
                    current_sheet=name,
                    address_spaces=address_spaces,
                )
                if isinstance(value, str) and value.startswith("=")
                else value
            )
        editable_ranges = [
            address_space.to_student_range(range_text).address
            for range_text in sheet["editable_ranges"]
        ]
        student_sheets.append({
            "name": name,
            "rows": rows,
            "columns": columns,
            "cells": cells,
            "editable_ranges": editable_ranges,
        })
        overlays.append({
            "student_sheet": name,
            "source_sheet": name,
            "source_range": address_space.source_range.address,
        })
    return {"schema_version": 2, "sheets": student_sheets}, overlays


def _prepare_file_template(
    element: lxml.html.HtmlElement, data: pl.QuestionData, answer_name: str
) -> tuple[dict[str, Any], list[dict[str, str]], dict[str, Any] | None]:
    data_children = element.xpath("./pl-spreadsheet-data")
    output_children = element.xpath("./pl-spreadsheet-output")
    loaded: dict[pathlib.Path, psp.SourceBook] = {}
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
            loaded[file_path] = psp.read_spreadsheet(file_path, sheet_name=sheet_name)
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
        student_range = _parse_range(
            raw_student_range,
            psp.AddressRange(
                psp.Address(row=0, column=0),
                psp.Address(
                    row=selected_source["rows"] - 1,
                    column=selected_source["columns"] - 1,
                ),
            ),
        )
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
            editable_range = _parse_range(raw_range.strip(), student_range)
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

    source_template = _normalize_template({
        "schema_version": 2,
        "sheets": public_sheets,
    })
    template, student_overlays = _student_relative_template(
        source_template, source_sheets
    )

    raw_grading_config = data["correct_answers"].get(answer_name)
    if raw_grading_config is not None and not isinstance(raw_grading_config, dict):
        raise TypeError(
            f'data["correct_answers"]["{answer_name}"] must be a spreadsheet grading object.'
        )
    raw_grading_config = _with_child_grading_config(element, raw_grading_config)
    if raw_grading_config is None and not output_children:
        return template, student_overlays, None

    grading_config = dict(raw_grading_config or {})
    grading_config["schema_version"] = 2
    grading_config["source_sheets"] = [
        *grading_config.get("source_sheets", []),
        *source_sheets,
    ]
    grading_config["student_overlays"] = [
        *grading_config.get("student_overlays", []),
        *student_overlays,
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
    return (
        template,
        student_overlays,
        _normalize_grading_config(grading_config, template),
    )


def _with_child_grading_config(
    element: lxml.html.HtmlElement, raw_config: dict[str, Any] | None
) -> dict[str, Any] | None:
    """Merge reference and parameter child elements into the raw grading config."""
    reference_children = element.xpath("./pl-spreadsheet-reference")
    parameter_children = element.xpath("./pl-spreadsheet-parameter")
    if not reference_children and not parameter_children:
        return raw_config
    config = dict(raw_config or {"schema_version": 2, "sheets": [], "outputs": {}})

    parameters = list(config.get("parameters", []))
    for child in parameter_children:
        if child.text and child.text.strip():
            raise ValueError("pl-spreadsheet-parameter may not contain text.")
        sheet_name = pl.get_string_attrib(child, "sheet-name")
        # Always quote the sheet name: open-ended ranges such as "A2:A" resolve
        # only once the student range is known, so this stays a string for now.
        parameters.append(
            f"'{sheet_name.replace("'", "''")}'!{pl.get_string_attrib(child, 'range')}"
        )
    if parameters:
        config["parameters"] = parameters

    if reference_children:
        reference = dict(config.get("reference") or {})
        cells = dict(reference.get("cells", {}))
        for child in reference_children:
            if child.text and child.text.strip():
                raise ValueError("pl-spreadsheet-reference may not contain text.")
            key = psp.QualifiedAddress(
                psp.Address.from_a1(pl.get_string_attrib(child, "cell")),
                pl.get_string_attrib(child, "sheet-name"),
            ).address
            if key in cells:
                raise ValueError(f'Spreadsheet reference cell "{key}" is duplicated.')
            cell: dict[str, Any] = {"value": pl.get_string_attrib(child, "formula")}
            for tolerance in ("rtol", "atol"):
                if pl.has_attrib(child, tolerance):
                    cell[tolerance] = pl.get_float_attrib(child, tolerance)
            cells[key] = cell
        reference["cells"] = cells
        config["reference"] = reference
    return config


def _get_config(
    element: lxml.html.HtmlElement, data: pl.QuestionData
) -> tuple[str, dict[str, Any]]:
    answer_name = pl.get_string_attrib(element, "answers-name")
    configs = data["params"].get("_pl_spreadsheet_v2", {})
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
        source_template = _normalize_template(data["params"].get(params_name))
        source_sheets = [
            {
                "name": sheet["name"],
                "rows": sheet["rows"],
                "columns": sheet["columns"],
                "cells": sheet["cells"],
            }
            for sheet in source_template["sheets"]
        ]
        template, student_overlays = _student_relative_template(
            source_template, source_sheets
        )
        raw_grading_config = data["correct_answers"].get(answer_name)
        if raw_grading_config is not None and not isinstance(raw_grading_config, dict):
            raise TypeError(
                f'data["correct_answers"]["{answer_name}"] must be a spreadsheet grading object.'
            )
        raw_grading_config = _with_child_grading_config(element, raw_grading_config)
        if raw_grading_config is not None:
            grading_config = dict(raw_grading_config)
            grading_config["schema_version"] = 2
            grading_config["source_sheets"] = [
                *grading_config.get("source_sheets", []),
                *source_sheets,
            ]
            grading_config["student_overlays"] = [
                *grading_config.get("student_overlays", []),
                *student_overlays,
            ]
            data["correct_answers"][answer_name] = _normalize_grading_config(
                grading_config, template
            )
    else:
        if not data_children:
            raise ValueError(
                'pl-spreadsheet requires either "params-name" or at least one pl-spreadsheet-data child.'
            )
        template, student_overlays, grading_config = _prepare_file_template(
            element, data, answer_name
        )
        if grading_config is not None:
            data["correct_answers"][answer_name] = grading_config
    height = pl.get_string_attrib(element, "height", DEFAULT_HEIGHT)
    if not CSS_SIZE_RE.fullmatch(height.strip()):
        raise ValueError(
            'Attribute "height" must be 0 or a non-negative CSS size such as "500px" or "40rem".'
        )

    configs = data["params"].get("_pl_spreadsheet_v2", {})
    if not isinstance(configs, dict):
        configs = {}
    configs[answer_name] = {
        "schema_version": 2,
        "template_hash": _content_hash({
            "template": template,
            "student_overlays": student_overlays,
        }),
        "template": template,
        "allow_blank": pl.get_boolean_attrib(
            element, "allow-blank", DEFAULT_ALLOW_BLANK
        ),
        "aria_label": pl.get_string_attrib(element, "aria-label", DEFAULT_ARIA_LABEL),
        "height": height,
    }
    data["params"]["_pl_spreadsheet_v2"] = configs


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


def _display_input_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    return str(value)


def _table_data(
    config: dict[str, Any],
    snapshot: Any,
    answer_cells: dict[str, set[str]] | None = None,
) -> list[dict[str, Any]]:
    snapshot_sheets = {}
    if isinstance(snapshot, dict):
        for sheet in snapshot.get("sheets", []):
            if isinstance(sheet, dict) and isinstance(sheet.get("name"), str):
                snapshot_sheets[sheet["name"]] = sheet

    table_sheets = []
    template = config.get("template", {})
    for sheet in template.get("sheets", []):
        snapshot_sheet = snapshot_sheets.get(sheet.get("name"), {})
        sheet_answer_cells = (answer_cells or {}).get(sheet.get("name"), set())
        snapshot_cells = snapshot_sheet.get("cells", {})
        template_cells = sheet.get("cells", {})
        rows = []
        for row_index in range(sheet.get("rows", 1)):
            cells = []
            for column_index in range(sheet.get("columns", 1)):
                address = f"{_column_name(column_index)}{row_index + 1}"
                snapshot_cell = snapshot_cells.get(address)
                if isinstance(snapshot_cell, dict):
                    value = _result_value(snapshot_cell)
                    formula = _display_input_value(_input_value(snapshot_cell))
                else:
                    value = formula = _display_input_value(template_cells.get(address))
                cell: dict[str, Any] = {
                    "address": address,
                    "value": value,
                    "formula": formula,
                }
                if address in sheet_answer_cells:
                    cell["answer_cell"] = True
                cells.append(cell)
            rows.append({"number": row_index + 1, "cells": cells})
        table_sheets.append({
            "name": sheet.get("name", "Spreadsheet"),
            "columns": [
                {"name": _column_name(index)}
                for index in range(sheet.get("columns", 1))
            ],
            "rows": rows,
        })
    return table_sheets


def _reference_student_cells(
    grading_config: dict[str, Any],
) -> list[tuple[str, str, Any]]:
    """Return each reference cell's student sheet, student address, and input, in order."""
    overlays = {
        overlay["source_sheet"]: overlay
        for overlay in grading_config.get("student_overlays", [])
    }
    student_cells: list[tuple[str, str, Any]] = []
    for cell in grading_config.get("reference", {}).get("cells", []):
        overlay = overlays.get(cell["sheet"])
        source_range = _parse_range(overlay["source_range"]) if overlay else None
        position = _parse_address(cell["cell"])
        if overlay is None or source_range is None or position is None:
            continue
        student_cells.append((
            overlay["student_sheet"],
            _column_name(position[1] - source_range.start_column)
            + str(position[0] - source_range.start_row + 1),
            cell["input"],
        ))
    return student_cells


def _reference_answer_cells(grading_config: dict[str, Any]) -> dict[str, set[str]]:
    """Return the student-relative addresses of reference cells, by student sheet."""
    answer_cells: dict[str, set[str]] = {}
    for sheet_name, address, _ in _reference_student_cells(grading_config):
        answer_cells.setdefault(sheet_name, set()).add(address)
    return answer_cells


def _all_match_feedback(*, has_test_cases: bool) -> str:
    if has_test_cases:
        return (
            "All answer cells match the reference solution on your worksheet and on "
            "every hidden test case."
        )
    return "All answer cells match the reference solution."


def _mismatch_feedback(
    passed: int,
    total: int,
    location: str,
    cause: Literal["value", "formula", "typed"],
) -> str:
    feedback = f"{passed} of {total} answer cells match the reference solution."
    if cause == "value":
        return (
            f"{feedback} For example, {location} does not calculate the expected value."
        )
    if cause == "formula":
        return (
            f"{feedback} For example, {location} is correct for the values shown but "
            "not for every hidden test case. Check that the formula works for other "
            "data too."
        )
    return (
        f"{feedback} For example, {location} is correct for the values shown but not "
        "when the hidden test cases change the data. Use a formula that refers to the "
        "data cells rather than a typed value."
    )


def _score_reference(book: psp.Book) -> tuple[float, str]:
    """Credit each reference cell that matches in every run, and explain a mismatch."""
    reference = book.reference
    if reference.cell_score() == 1:
        return 1, _all_match_feedback(has_test_cases=bool(book.cases))
    passed = sum(series.all_match for series in reference.values())
    address, mismatch = next(
        (address, series.first_mismatch)
        for address, series in reference.items()
        if series.first_mismatch is not None
    )
    cell = book.student_cell(address)
    location = cell.qualified_address if len(book.sheet_names) > 1 else cell.address
    cause: Literal["value", "formula", "typed"]
    if mismatch.case is None:
        cause = "value"
    elif cell.is_formula:
        cause = "formula"
    else:
        cause = "typed"
    return passed / len(reference), _mismatch_feedback(
        passed, len(reference), location, cause
    )


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
        grading_config = data["correct_answers"].get(answer_name)
        answer = (
            grading_config.get("answer") if isinstance(grading_config, dict) else None
        )
        if isinstance(grading_config, dict) and isinstance(answer, dict):
            render_data.update({
                "read_only": True,
                "reference_answer": True,
                "sheets": _table_data(
                    config, answer, _reference_answer_cells(grading_config)
                ),
            })
        else:
            render_data["answer"] = True
    elif data["panel"] == "question" and data["editable"]:
        initial_submission = json.dumps(
            {
                "schema_version": 2,
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
        if data["panel"] == "submission":
            partial_score = data["partial_scores"].get(answer_name, {})
            score = partial_score.get("score")
            if score is not None:
                score_type, score_value = pl.determine_score_params(score)
                render_data[score_type] = score_value
            render_data["feedback"] = partial_score.get("feedback")

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
    if submission.get("schema_version") != 2:
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


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, "answers-name")
    grading_config = data["correct_answers"].get(answer_name)
    # Without a reference solution, grading is defined by the question.
    if not isinstance(grading_config, dict) or "reference" not in grading_config:
        return
    pl.grade_answer_parameterized(
        data,
        answer_name,
        lambda submission: _score_reference(
            psp.Book(submission, grading=grading_config)
        ),
        weight=pl.get_integer_attrib(element, "weight", DEFAULT_WEIGHT),
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


def _editable_template_cells(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    sheets: dict[str, dict[str, Any]] = {}
    for sheet in config.get("template", {}).get("sheets", []):
        for address, value in sheet["cells"].items():
            position = _parse_address(address)
            if position is not None and _cell_is_editable(sheet, *position):
                sheets.setdefault(sheet["name"], {})[address] = value
    return sheets


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    answer_name, config = _get_config(element, data)
    if data["test_type"] == "invalid":
        data["raw_submitted_answers"][answer_name] = "not valid json"
        data["format_errors"][answer_name] = "The spreadsheet answer is invalid."
        return
    grading_config = data["correct_answers"].get(answer_name)
    if isinstance(grading_config, dict) and "reference" in grading_config:
        _test_reference(element, data, answer_name, config, grading_config)
        return
    # Without a reference, the element cannot know a correct answer. Resubmitting
    # the starting values keeps formulas and required outputs evaluating the way
    # they do in the unedited workbook; placeholder text could turn them into errors.
    sheets = _editable_template_cells(config)
    if not sheets:
        sheet_name, address = _first_editable_cell(config)
        sheets = {sheet_name: {address: f"Test {data['test_type']}"}}
    data["raw_submitted_answers"][answer_name] = json.dumps(
        {
            "schema_version": 2,
            "template_hash": config.get("template_hash", ""),
            "sheets": sheets,
        },
        separators=(",", ":"),
    )


def _test_reference(
    element: lxml.html.HtmlElement,
    data: pl.ElementTestData,
    answer_name: str,
    config: dict[str, Any],
    grading_config: dict[str, Any],
) -> None:
    """Submit the reference solution, or text that matches no reference result."""
    correct = data["test_type"] == "correct"
    student_cells = _reference_student_cells(grading_config)
    sheets: dict[str, dict[str, Any]] = {}
    for sheet_name, address, value in student_cells:
        sheets.setdefault(sheet_name, {})[address] = value if correct else "Incorrect"
    data["raw_submitted_answers"][answer_name] = json.dumps(
        {
            "schema_version": 2,
            "template_hash": config.get("template_hash", ""),
            "sheets": sheets,
        },
        separators=(",", ":"),
    )
    if correct:
        score = 1
        feedback = _all_match_feedback(
            has_test_cases=bool(grading_config.get("test_cases"))
        )
    else:
        score = 0
        sheet_name, address, _ = student_cells[0]
        location = (
            psp.QualifiedAddress(psp.Address.from_a1(address), sheet_name).address
            if len(config["template"]["sheets"]) > 1
            else address
        )
        feedback = _mismatch_feedback(0, len(student_cells), location, "value")
    data["partial_scores"][answer_name] = {
        "score": score,
        "weight": pl.get_integer_attrib(element, "weight", DEFAULT_WEIGHT),
        "feedback": feedback,
    }
