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

SCHEMA_PATH = pathlib.Path(__file__).parent / "schemas" / "pl-spreadsheet.json"

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

CELL_ADDRESS_RE = re.compile(r"^([A-Z]+)([1-9][0-9]*)$")
SHEET_NAME_RE = re.compile(r"^[^\\/*?:\[\]]{1,31}$")
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


def _parse_range(range_text: str) -> tuple[int, int, int, int] | None:
    parts = range_text.upper().split(":")
    if len(parts) > 2:
        return None
    start = _parse_address(parts[0])
    end = _parse_address(parts[-1])
    if start is None or end is None:
        return None
    return (
        min(start[0], end[0]),
        max(start[0], end[0]),
        min(start[1], end[1]),
        max(start[1], end[1]),
    )


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
    has_editable_cell = False

    for sheet_index, raw_sheet in enumerate(raw_sheets, start=1):
        if not isinstance(raw_sheet, dict):
            raise TypeError(f"Sheet {sheet_index} must be an object.")
        name = raw_sheet.get("name")
        if (
            not isinstance(name, str)
            or name.strip() != name
            or not SHEET_NAME_RE.fullmatch(name)
        ):
            raise ValueError(
                f"Sheet {sheet_index} must have a non-empty Excel-safe name of at most 31 characters."
            )
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
                or parsed_range[1] >= rows
                or parsed_range[3] >= columns
            ):
                raise ValueError(
                    f'Editable range "{raw_range}" is outside sheet "{name}".'
                )
            start_row, end_row, start_column, end_column = parsed_range
            editable_ranges.append(
                f"{_column_name(start_column)}{start_row + 1}:{_column_name(end_column)}{end_row + 1}"
            )
            has_editable_cell = True

        normalized_sheets.append({
            "name": name,
            "rows": rows,
            "columns": columns,
            "cells": cells,
            "editable_ranges": editable_ranges,
        })

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
    if not has_editable_cell:
        raise ValueError(
            "The spreadsheet template must contain at least one editable cell."
        )

    return {"schema_version": 1, "sheets": normalized_sheets}


def _template_hash(template: dict[str, Any]) -> str:
    serialized = json.dumps(
        template, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _get_config(
    element: lxml.html.HtmlElement, data: pl.QuestionData
) -> tuple[str, dict[str, Any]]:
    answer_name = pl.get_string_attrib(element, "answers-name")
    configs = data["params"].get("_pl_spreadsheet_v1", {})
    config = configs.get(answer_name, {}) if isinstance(configs, dict) else {}
    return answer_name, config


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.validate_element(element, SCHEMA_PATH)

    answer_name = pl.get_string_attrib(element, "answers-name")
    params_name = pl.get_string_attrib(element, "params-name")
    pl.check_answers_names(data, answer_name)

    if params_name not in data["params"]:
        raise ValueError(f'No value was found in data["params"]["{params_name}"].')
    template = _normalize_template(data["params"].get(params_name))
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
        rows = []
        for row_index in range(sheet.get("rows", 0)):
            cells = []
            for column_index in range(sheet.get("columns", 0)):
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
                for index in range(sheet.get("columns", 0))
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
            if (
                parsed_range[0] <= position[0] <= parsed_range[1]
                and parsed_range[2] <= position[1] <= parsed_range[3]
            ):
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
        if not has_editable_input:
            _add_format_error(
                data, answer_name, "The spreadsheet answer may not be blank."
            )


def _first_editable_cell(config: dict[str, Any]) -> tuple[str, str]:
    for sheet in config.get("template", {}).get("sheets", []):
        ranges = sheet.get("editable_ranges", [])
        if ranges:
            parsed_range = _parse_range(ranges[0])
            if parsed_range is not None:
                return sheet[
                    "name"
                ], f"{_column_name(parsed_range[2])}{parsed_range[0] + 1}"
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
