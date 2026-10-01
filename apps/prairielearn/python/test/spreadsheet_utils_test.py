from dataclasses import FrozenInstanceError
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
            },
            {
                "name": "Input Data",
                "rows": 2,
                "columns": 2,
                "cells": {
                    "A1": {
                        "input": {"type": "number", "value": 10},
                        "result": {"type": "number", "value": 10},
                    },
                    "B2": {
                        "input": {"type": "formula", "value": "=A1+5"},
                        "result": {"type": "number", "value": 15},
                    },
                },
            },
            {
                "name": "Bob's Data",
                "rows": 1,
                "columns": 1,
                "cells": {
                    "A1": {
                        "input": {"type": "string", "value": "quoted"},
                        "result": {"type": "string", "value": "quoted"},
                    }
                },
            },
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


def test_spreadsheet_wrapper_addresses_cells_and_sheets() -> None:
    workbook = pl.Spreadsheet(snapshot())

    assert workbook.sheet_names == ("Inputs", "Input Data", "Bob's Data")
    inputs = workbook["Inputs"]
    assert inputs.workbook is workbook
    assert inputs.name == "Inputs"
    assert inputs.shape == (3, 3)
    assert inputs.rows == 3
    assert inputs.columns == 3

    cell = inputs["a1"]
    assert isinstance(cell, pl.SpreadsheetCellView)
    assert cell.sheet is inputs
    assert cell.address == "A1"
    assert cell.qualified_address == "Inputs!A1"
    assert cell.row == 1
    assert cell.column == "A"
    assert cell.input == {"type": "number", "value": 3}
    assert cell.result == {"type": "number", "value": 3}
    assert cell.value == 3
    assert not cell.is_empty
    assert not cell.is_formula
    assert not cell.is_error

    empty = inputs["A2"]
    assert isinstance(empty, pl.SpreadsheetCellView)
    assert empty.input is None
    assert empty.result == {"type": "empty"}
    assert empty.value is None
    assert empty.is_empty


def test_spreadsheet_wrapper_resolves_cross_sheet_references() -> None:
    workbook = pl.Spreadsheet(snapshot())
    inputs = workbook["Inputs"]

    other_range = inputs["'Input Data'!A1:B2"]
    assert isinstance(other_range, pl.SpreadsheetRange)
    assert other_range.sheet is workbook["Input Data"]
    assert other_range.address == "A1:B2"
    assert other_range.qualified_address == "'Input Data'!A1:B2"
    assert other_range.shape == (2, 2)
    assert other_range.values == ((10, None), (None, 15))
    assert other_range["B2"].value == 15
    assert other_range["'Input Data'!A1"].value == 10

    quoted_cell = inputs["'Bob''s Data'!A1"]
    assert isinstance(quoted_cell, pl.SpreadsheetCellView)
    assert quoted_cell.value == "quoted"
    assert quoted_cell.qualified_address == "'Bob''s Data'!A1"


@pytest.mark.parametrize(
    ("reference", "error"),
    [
        ("Inputs!A1:'Input Data'!B2", "cannot span multiple sheets"),
        ("A1:'Input Data'!B2", "cannot span multiple sheets"),
        ("B2:A1", "top-left to bottom-right"),
        ("'Input Data!A1", "Invalid spreadsheet reference"),
        ("A:A", "Invalid spreadsheet reference"),
        ("A1:B2:C3", "Invalid spreadsheet reference"),
    ],
)
def test_spreadsheet_wrapper_rejects_invalid_references(
    reference: str, error: str
) -> None:
    inputs = pl.Spreadsheet(snapshot())["Inputs"]

    with pytest.raises(ValueError, match=error):
        inputs[reference]

    with pytest.raises(KeyError, match="Unknown spreadsheet sheet"):
        inputs["Missing!A1"]
    with pytest.raises(ValueError, match="outside the sheet"):
        inputs["D1"]


def test_spreadsheet_range_projections_queries_and_indexing() -> None:
    inputs = pl.Spreadsheet(snapshot())["Inputs"]
    cell_range = inputs["A1:B2"]
    assert isinstance(cell_range, pl.SpreadsheetRange)

    assert tuple(cell.address for cell in cell_range.iter_cells()) == (
        "A1",
        "B1",
        "A2",
        "B2",
    )
    assert tuple(
        cell.address for cell in cell_range.iter_cells(include_empty=False)
    ) == (
        "A1",
        "B1",
    )
    assert cell_range.inputs == (
        (
            {"type": "number", "value": 3},
            {"type": "formula", "value": "=A1*2"},
        ),
        (None, None),
    )
    assert cell_range.results == (
        ({"type": "number", "value": 3}, {"type": "number", "value": 6}),
        ({"type": "empty"}, {"type": "empty"}),
    )
    assert cell_range.values == ((3, 6), (None, None))
    assert cell_range.formulas == ((None, "=A1*2"), (None, None))
    assert tuple(
        cell.address for cell in cell_range.query(lambda cell: cell.is_formula)
    ) == ("B1",)
    assert tuple(
        cell.address
        for cell in cell_range.query(lambda cell: cell.is_empty, include_empty=True)
    ) == ("A2", "B2")
    assert cell_range["A1"].value == 3

    with pytest.raises(ValueError, match="outside range"):
        cell_range["C1"]
    with pytest.raises(ValueError, match="single cell"):
        cell_range["A1:B1"]

    formulas = inputs.query(lambda cell: cell.is_formula)
    assert tuple(cell.address for cell in formulas) == ("B1", "C1")


def test_spreadsheet_cell_formula_matching() -> None:
    inputs = pl.Spreadsheet(snapshot())["Inputs"]
    formula = inputs["B1"]
    assert isinstance(formula, pl.SpreadsheetCellView)

    assert formula.formula == "=A1*2"
    assert formula.formula_ast == pl.parse_spreadsheet_formula("=A1*2")
    assert formula.matches_formula("=A1*2")
    assert not formula.matches_formula("=A1 * 2")
    assert formula.matches_formula("=A1 * 2", structural=True)
    assert not cast(pl.SpreadsheetCellView, inputs["A1"]).matches_formula("=A1")

    with pytest.raises(pl.SpreadsheetFormulaParseError):
        formula.matches_formula("not-a-formula", structural=True)


def test_spreadsheet_output_views() -> None:
    workbook = pl.Spreadsheet(snapshot())

    assert tuple(workbook.outputs) == ("total", "failed_check")
    total = workbook.outputs["total"]
    assert total.name == "total"
    assert total.result == {"type": "number", "value": 6}
    assert total.value == 6
    assert not total.is_error
    assert total.error_type is None
    assert total.error_value is None

    failed = workbook.outputs["failed_check"]
    assert failed.is_error
    assert failed.error_type == "NA"
    assert failed.error_value == "#N/A"
    with pytest.raises(pl.SpreadsheetOutputError) as exc_info:
        _ = failed.value
    assert isinstance(exc_info.value, pl.SpreadsheetResultError)
    assert exc_info.value.output_name == "failed_check"
    assert exc_info.value.error_type == "NA"
    assert exc_info.value.error_value == "#N/A"

    without_outputs = snapshot()
    without_outputs.pop("grading")
    outputs = pl.Spreadsheet(without_outputs).outputs
    assert len(outputs) == 0
    with pytest.raises(KeyError, match="does not contain private grading outputs"):
        outputs["total"]


def test_formula_ast_respects_operator_precedence() -> None:
    ast = pl.parse_spreadsheet_formula("=A1+B2*C3^2")
    root = ast.root

    assert ast.schema_version == 1
    assert ast.formula == "=A1+B2*C3^2"
    assert isinstance(root, pl.FormulaBinaryNode)
    assert root.type == "binary"
    assert root.operator == "+"
    assert isinstance(root.right, pl.FormulaBinaryNode)
    assert root.right.operator == "*"
    assert isinstance(root.right.right, pl.FormulaBinaryNode)
    assert root.right.right.operator == "^"
    assert not hasattr(ast, "__dict__")
    assert not hasattr(root, "__dict__")
    set_attribute = setattr
    with pytest.raises(FrozenInstanceError):
        set_attribute(ast, "formula", "=1")


def test_formula_ast_preserves_formula_structure_and_references() -> None:
    ast = pl.parse_spreadsheet_formula("=IF('Sheet Name'!$A1:B$2>=3,\"ok\",)")
    root = ast.root

    assert isinstance(root, pl.FormulaFunctionNode)
    assert root.type == "function"
    assert root.name == "IF"
    assert len(root.arguments) == 3
    comparison = root.arguments[0]
    assert isinstance(comparison, pl.FormulaBinaryNode)
    assert comparison.operator == ">="
    reference_range = comparison.left
    assert isinstance(reference_range, pl.FormulaCellRangeNode)
    assert reference_range.start.kind == "cell"
    assert reference_range.start.row == 1
    assert reference_range.end.kind == "cell"
    assert reference_range.end.column == "B"
    assert reference_range == pl.FormulaCellRangeNode(
        start=pl.FormulaCellReference(
            sheet="Sheet Name",
            column="A",
            row=1,
            column_absolute=True,
            row_absolute=False,
        ),
        end=pl.FormulaCellReference(
            sheet=None,
            column="B",
            row=2,
            column_absolute=False,
            row_absolute=True,
        ),
    )
    assert isinstance(root.arguments[2], pl.FormulaEmptyNode)


def test_formula_ast_handles_unary_postfix_and_full_ranges() -> None:
    unary = pl.parse_spreadsheet_formula("=-A1%")
    assert isinstance(unary.root, pl.FormulaUnaryNode)
    assert isinstance(unary.root.operand, pl.FormulaPostfixNode)

    ranges = pl.parse_spreadsheet_formula("=SUM($A:$B,1:2)")
    assert isinstance(ranges.root, pl.FormulaFunctionNode)
    column_range = ranges.root.arguments[0]
    row_range = ranges.root.arguments[1]
    assert isinstance(column_range, pl.FormulaColumnRangeNode)
    assert isinstance(row_range, pl.FormulaRowRangeNode)
    assert column_range.start.kind == "column"
    assert column_range.start.column == "A"
    assert column_range.start.column_absolute is True
    assert column_range.end.kind == "column"
    assert column_range.end.column == "B"
    assert row_range.start.kind == "row"
    assert row_range.start.row == 1
    assert row_range.end.kind == "row"
    assert row_range.end.row == 2


@pytest.mark.parametrize(
    ("formula", "expected"),
    [
        (
            '=(1+2)&"x"',
            pl.FormulaBinaryNode(
                operator="&",
                left=pl.FormulaGroupNode(
                    expression=pl.FormulaBinaryNode(
                        operator="+",
                        left=pl.FormulaLiteralNode(value_type="number", value=1),
                        right=pl.FormulaLiteralNode(value_type="number", value=2),
                    )
                ),
                right=pl.FormulaLiteralNode(value_type="string", value="x"),
            ),
        ),
        (
            "=TRUE=FALSE",
            pl.FormulaBinaryNode(
                operator="=",
                left=pl.FormulaLiteralNode(value_type="boolean", value=True),
                right=pl.FormulaLiteralNode(value_type="boolean", value=False),
            ),
        ),
        (
            "=#N/A",
            pl.FormulaLiteralNode(value_type="error", value="#N/A"),
        ),
        (
            "=sum(A1)",
            pl.FormulaFunctionNode(
                name="SUM",
                arguments=(
                    pl.FormulaReferenceNode(
                        reference=pl.FormulaCellReference(
                            sheet=None,
                            column="A",
                            row=1,
                            column_absolute=False,
                            row_absolute=False,
                        )
                    ),
                ),
            ),
        ),
    ],
)
def test_formula_ast_golden_nodes(formula: str, expected: pl.FormulaAstNode) -> None:
    assert pl.parse_spreadsheet_formula(formula).root == expected


def test_get_formula_ast_and_invalid_formula() -> None:
    ast = pl.get_spreadsheet_formula_ast(snapshot(), "Inputs", "B1")
    assert ast is not None
    assert ast.formula == "=A1*2"
    assert pl.get_spreadsheet_formula_ast(snapshot(), "Inputs", "A1") is None

    with pytest.raises(pl.SpreadsheetFormulaParseError, match="must start"):
        pl.parse_spreadsheet_formula("A1+1")
    with pytest.raises(pl.SpreadsheetFormulaParseError, match="Unsupported"):
        pl.parse_spreadsheet_formula("=named_expression")
    with pytest.raises(pl.SpreadsheetFormulaParseError, match="incompatible endpoint"):
        pl.parse_spreadsheet_formula("=A1:B")
