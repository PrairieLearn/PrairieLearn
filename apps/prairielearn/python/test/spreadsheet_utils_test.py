from typing import Any, cast

import prairielearn as pl
import pytest


def snapshot() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "template_hash": "template-hash",
        "engine": {
            "name": "hyperformula",
            "version": "3.4.0",
            "configuration_version": 1,
        },
        "sheets": [
            {
                "name": "Inputs",
                "rows": 3,
                "columns": 3,
                "cells": {
                    "A1": {
                        "input": {"type": "number", "value": 3},
                        "result": {"type": "number", "value": 3},
                    },
                    "B1": {
                        "input": {"type": "formula", "value": "=A1*2"},
                        "result": {"type": "number", "value": 6},
                    },
                    "C1": {
                        "input": {"type": "formula", "value": "=1/0"},
                        "result": {
                            "type": "error",
                            "value": "#DIV/0!",
                            "error_type": "DIV_BY_ZERO",
                        },
                    },
                },
            }
        ],
        "grading": {
            "schema_version": 1,
            "grader_hash": "grader-hash",
            "outputs": {
                "total": {"type": "number", "value": 6},
                "failed_check": {
                    "type": "error",
                    "value": "#N/A",
                    "error_type": "NA",
                },
            },
        },
    }


def test_queries_cells_formulas_and_outputs() -> None:
    workbook = snapshot()

    assert pl.get_spreadsheet_cell(workbook, "Inputs", "a1") == {
        "input": {"type": "number", "value": 3},
        "result": {"type": "number", "value": 3},
    }
    assert pl.get_spreadsheet_cell(workbook, "Inputs", "A2") is None
    assert pl.get_spreadsheet_result(workbook, "Inputs", "A2") == {"type": "empty"}
    assert pl.get_spreadsheet_value(workbook, "Inputs", "B1") == 6
    assert pl.get_spreadsheet_formula(workbook, "Inputs", "B1") == "=A1*2"
    assert pl.get_spreadsheet_formula(workbook, "Inputs", "A1") is None
    assert pl.get_spreadsheet_grading_output(workbook, "total") == {
        "type": "number",
        "value": 6,
    }


def test_query_errors_are_explicit() -> None:
    workbook = snapshot()

    with pytest.raises(KeyError, match="Unknown spreadsheet sheet"):
        pl.get_spreadsheet_cell(workbook, "Missing", "A1")
    with pytest.raises(ValueError, match="outside the sheet"):
        pl.get_spreadsheet_cell(workbook, "Inputs", "D1")
    with pytest.raises(ValueError, match="Invalid spreadsheet cell address"):
        pl.get_spreadsheet_cell(workbook, "Inputs", "not-a-cell")
    with pytest.raises(KeyError, match="Unknown spreadsheet grading output"):
        pl.get_spreadsheet_grading_output(workbook, "missing")
    workbook.pop("grading")
    with pytest.raises(KeyError, match="does not contain private grading outputs"):
        pl.get_spreadsheet_grading_output(workbook, "total")
    with pytest.raises(pl.SpreadsheetCellError) as exc_info:
        pl.get_spreadsheet_value(workbook, "Inputs", "C1")
    assert exc_info.value.error_type == "DIV_BY_ZERO"
    assert exc_info.value.error_value == "#DIV/0!"


def test_formula_ast_respects_operator_precedence() -> None:
    ast = pl.parse_spreadsheet_formula("=A1+B2*C3^2")
    root = ast["root"]

    assert ast["schema_version"] == 1
    assert ast["formula"] == "=A1+B2*C3^2"
    assert root["type"] == "binary"
    assert root["operator"] == "+"
    right = root["right"]
    assert right["type"] == "binary"
    binary_right = cast(pl.FormulaBinaryNode, right)
    assert binary_right["operator"] == "*"
    exponent = binary_right["right"]
    assert exponent["type"] == "binary"
    assert cast(pl.FormulaBinaryNode, exponent)["operator"] == "^"


def test_formula_ast_preserves_formula_structure_and_references() -> None:
    ast = pl.parse_spreadsheet_formula("=IF('Sheet Name'!$A1:B$2>=3,\"ok\",)")
    root = ast["root"]

    assert root["type"] == "function"
    assert root["name"] == "IF"
    assert len(root["arguments"]) == 3
    comparison = root["arguments"][0]
    assert comparison["type"] == "binary"
    assert comparison["operator"] == ">="
    reference_range = comparison["left"]
    assert reference_range["type"] == "range"
    cell_range = cast(pl.FormulaCellRangeNode, reference_range)
    assert cell_range["start"]["kind"] == "cell"
    assert cell_range["start"]["row"] == 1
    assert cell_range["end"]["kind"] == "cell"
    assert cell_range["end"]["column"] == "B"
    assert reference_range == {
        "type": "range",
        "start": {
            "kind": "cell",
            "sheet": "Sheet Name",
            "column": "A",
            "row": 1,
            "column_absolute": True,
            "row_absolute": False,
        },
        "end": {
            "kind": "cell",
            "sheet": None,
            "column": "B",
            "row": 2,
            "column_absolute": False,
            "row_absolute": True,
        },
    }
    assert root["arguments"][2] == {"type": "empty"}


def test_formula_ast_handles_unary_postfix_and_full_ranges() -> None:
    unary = pl.parse_spreadsheet_formula("=-A1%")
    assert unary["root"]["type"] == "unary"
    assert unary["root"]["operand"]["type"] == "postfix"

    ranges = pl.parse_spreadsheet_formula("=SUM($A:$B,1:2)")
    assert ranges["root"]["type"] == "function"
    column_range = ranges["root"]["arguments"][0]
    row_range = ranges["root"]["arguments"][1]
    assert column_range["type"] == "range"
    assert row_range["type"] == "range"
    typed_column_range = cast(pl.FormulaColumnRangeNode, column_range)
    typed_row_range = cast(pl.FormulaRowRangeNode, row_range)
    assert typed_column_range["start"]["kind"] == "column"
    assert typed_column_range["start"]["column"] == "A"
    assert typed_column_range["start"]["column_absolute"] is True
    assert typed_column_range["end"]["kind"] == "column"
    assert typed_column_range["end"]["column"] == "B"
    assert typed_row_range["start"]["kind"] == "row"
    assert typed_row_range["start"]["row"] == 1
    assert typed_row_range["end"]["kind"] == "row"
    assert typed_row_range["end"]["row"] == 2


@pytest.mark.parametrize(
    ("formula", "expected"),
    [
        (
            '=(1+2)&"x"',
            {
                "type": "binary",
                "operator": "&",
                "left": {
                    "type": "group",
                    "expression": {
                        "type": "binary",
                        "operator": "+",
                        "left": {"type": "literal", "value_type": "number", "value": 1},
                        "right": {
                            "type": "literal",
                            "value_type": "number",
                            "value": 2,
                        },
                    },
                },
                "right": {"type": "literal", "value_type": "string", "value": "x"},
            },
        ),
        (
            "=TRUE=FALSE",
            {
                "type": "binary",
                "operator": "=",
                "left": {"type": "literal", "value_type": "boolean", "value": True},
                "right": {"type": "literal", "value_type": "boolean", "value": False},
            },
        ),
        (
            "=#N/A",
            {"type": "literal", "value_type": "error", "value": "#N/A"},
        ),
        (
            "=sum(A1)",
            {
                "type": "function",
                "name": "SUM",
                "arguments": [
                    {
                        "type": "reference",
                        "reference": {
                            "kind": "cell",
                            "sheet": None,
                            "column": "A",
                            "row": 1,
                            "column_absolute": False,
                            "row_absolute": False,
                        },
                    }
                ],
            },
        ),
    ],
)
def test_formula_ast_golden_nodes(formula: str, expected: dict[str, Any]) -> None:
    assert pl.parse_spreadsheet_formula(formula)["root"] == expected


def test_get_formula_ast_and_invalid_formula() -> None:
    ast = pl.get_spreadsheet_formula_ast(snapshot(), "Inputs", "B1")
    assert ast is not None
    assert ast["formula"] == "=A1*2"
    assert pl.get_spreadsheet_formula_ast(snapshot(), "Inputs", "A1") is None

    with pytest.raises(pl.SpreadsheetFormulaParseError, match="must start"):
        pl.parse_spreadsheet_formula("A1+1")
    with pytest.raises(pl.SpreadsheetFormulaParseError, match="Unsupported"):
        pl.parse_spreadsheet_formula("=named_expression")
    with pytest.raises(pl.SpreadsheetFormulaParseError, match="incompatible endpoint"):
        pl.parse_spreadsheet_formula("=A1:B")
