import datetime
import random
from dataclasses import FrozenInstanceError, is_dataclass
from pathlib import Path
from typing import Any, cast

import numpy as np
import pandas as pd
import prairielearn.spreadsheet_utils as psp
import pytest
from formualizer import Workbook


def snapshot() -> psp.Snapshot:
    return {
        "schema_version": 2,
        "template_hash": "template-hash",
        "engine": {
            "name": "formualizer",
            "version": "0.9.3",
            "configuration_version": 2,
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
            "schema_version": 2,
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


def snapshot_grading(
    spreadsheet_snapshot: psp.Snapshot,
) -> psp.SnapshotGrading:
    return cast(
        psp.SnapshotGrading,
        spreadsheet_snapshot.get("grading"),
    )


def test_public_type_names_are_concise_in_module_namespace() -> None:
    expected = {
        "Address",
        "AddressRange",
        "AddressSpace",
        "AddressSpaceMap",
        "Book",
        "Cell",
        "CellRange",
        "Definition",
        "GradingBook",
        "Input",
        "Output",
        "OutputInput",
        "OutputSpec",
        "Result",
        "Sheet",
        "SheetInput",
        "SheetSpec",
        "Snapshot",
        "SourceBook",
        "Value",
        "create_spreadsheet",
    }

    assert expected <= set(psp.__all__)
    assert not any(name.startswith("Spreadsheet") for name in psp.__all__)


@pytest.mark.parametrize(
    ("address", "expected"),
    [
        ("a1", ("A1", 0, 0)),
        ("aa10", ("AA10", 9, 26)),
        ("zZ99", ("ZZ99", 98, 701)),
    ],
)
def test_normalized_address_accepts_case_insensitive_columns(
    address: str, expected: tuple[str, int, int]
) -> None:
    assert psp._normalized_address(address) == expected


def test_qualified_address_parses_quoted_sheet_names() -> None:
    address = psp.QualifiedAddress.from_a1("'Bob''s Data'!b2")

    assert address == psp.QualifiedAddress(
        local=psp.Address(row=1, column=1),
        sheet_name="Bob's Data",
    )
    assert address.address == "'Bob''s Data'!B2"


def test_ranges_report_shape_and_containment() -> None:
    local_range = psp.AddressRange(
        psp.Address(row=1, column=2),
        psp.Address(row=3, column=5),
    )

    assert local_range.shape == (3, 4)
    assert psp.Address(row=1, column=2) in local_range
    assert psp.Address(row=3, column=5) in local_range
    assert psp.Address(row=0, column=2) not in local_range
    assert psp.Address(row=3, column=6) not in local_range
    assert (
        psp.AddressRange(
            psp.Address(row=2, column=3),
            psp.Address(row=3, column=5),
        )
        in local_range
    )

    qualified_range = psp.QualifiedAddressRange(local_range, "Inputs")
    assert qualified_range.shape == (3, 4)
    assert (
        psp.QualifiedAddress(psp.Address(row=2, column=4), "Inputs") in qualified_range
    )
    assert psp.Address(row=2, column=4) in qualified_range
    assert (
        psp.QualifiedAddress(psp.Address(row=2, column=4), "Other")
        not in qualified_range
    )
    assert (
        psp.AddressRange(
            psp.Address(row=2, column=3),
            psp.Address(row=3, column=5),
        )
        in qualified_range
    )
    assert psp.QualifiedAddressRange(local_range, "Inputs") in qualified_range
    assert psp.QualifiedAddressRange(local_range, "Other") not in qualified_range


def test_range_intersections() -> None:
    local_range = psp.AddressRange(
        psp.Address(row=1, column=2),
        psp.Address(row=4, column=5),
    )
    overlapping = psp.AddressRange(
        psp.Address(row=3, column=1),
        psp.Address(row=5, column=3),
    )
    expected_local = psp.AddressRange(
        psp.Address(row=3, column=2),
        psp.Address(row=4, column=3),
    )
    disjoint = psp.AddressRange(
        psp.Address(row=5, column=2),
        psp.Address(row=6, column=5),
    )

    assert local_range.intersection(overlapping) == expected_local
    assert local_range.intersection(disjoint) is None

    qualified_range = psp.QualifiedAddressRange(local_range, "Inputs")
    expected_qualified = psp.QualifiedAddressRange(expected_local, "Inputs")
    assert qualified_range.intersection(overlapping) == expected_qualified
    assert (
        qualified_range.intersection(psp.QualifiedAddressRange(overlapping, "Inputs"))
        == expected_qualified
    )
    assert (
        qualified_range.intersection(psp.QualifiedAddressRange(overlapping, "Other"))
        is None
    )
    assert (
        local_range.intersection(psp.QualifiedAddressRange(overlapping, "Other"))
        == expected_local
    )


def test_address_ranges_parse_and_translate_relative_coordinates() -> None:
    cell_range = psp.AddressRange.from_a1("D5:B3")

    assert cell_range.address == "B3:D5"
    assert cell_range.shape == (3, 3)
    assert cell_range.to_source(psp.Address(1, 2)).address == "D4"
    assert cell_range.to_relative(psp.Address.from_a1("C5")) == (psp.Address(2, 1))
    with pytest.raises(ValueError, match="outside"):
        cell_range.to_source(psp.Address(3, 0))


def test_create_spreadsheet_builds_versioned_books_from_relaxed_sheets() -> None:
    workbook = psp.create_spreadsheet({
        "Inputs": {
            "cells": {
                "a1": "Quantity",
                "B2": np.int64(3),
                "C3": None,
            },
            "rows": 6,
            "columns": 5,
            "editable_ranges": ("b2:d4",),
            "student_range": "A1:E6",
        },
        "Summary": {"b2": "=SUM(Inputs!B2:B6)"},
    })

    assert workbook == {
        "schema_version": 2,
        "sheets": [
            {
                "name": "Inputs",
                "rows": 6,
                "columns": 5,
                "cells": {"A1": "Quantity", "B2": 3},
                "editable_ranges": ["B2:D4"],
                "student_range": "A1:E6",
            },
            {
                "name": "Summary",
                "rows": 2,
                "columns": 2,
                "cells": {"B2": "=SUM(Inputs!B2:B6)"},
            },
        ],
    }


def test_create_spreadsheet_adds_normalized_output_declarations() -> None:
    workbook = psp.create_spreadsheet(
        {"Checks": {"A1": "=1+1", "A2": "=A1=2"}},
        outputs={
            "score": "Checks!a1",
            "is_correct": {
                "cell": "Checks!A2",
                "required": True,
            },
            "split_address": {"sheet": "Checks", "cell": "A1"},
        },
    )

    assert workbook == {
        "schema_version": 2,
        "sheets": [
            {
                "name": "Checks",
                "rows": 2,
                "columns": 1,
                "cells": {"A1": "=1+1", "A2": "=A1=2"},
            }
        ],
        "outputs": {
            "score": {"sheet": "Checks", "cell": "A1"},
            "is_correct": {
                "sheet": "Checks",
                "cell": "A2",
                "required": True,
            },
            "split_address": {"sheet": "Checks", "cell": "A1"},
        },
    }


def test_create_spreadsheet_rejects_ambiguous_output_addresses() -> None:
    with pytest.raises(ValueError, match="must provide a sheet"):
        psp.create_spreadsheet({"Checks": {"A1": 1}}, outputs={"score": "A1"})

    with pytest.raises(ValueError, match="conflicts"):
        psp.create_spreadsheet(
            {"Checks": {"A1": 1}},
            outputs={
                "score": {"sheet": "Checks", "cell": "Other!A1"},
            },
        )


def test_create_spreadsheet_rejects_inconsistent_bounds() -> None:
    with pytest.raises(ValueError, match="does not contain"):
        psp.create_spreadsheet({
            "Inputs": {"cells": {"B2": 1}, "rows": 1, "columns": 2}
        })

    with pytest.raises(ValueError, match="outside the student range"):
        psp.create_spreadsheet({
            "Inputs": {"cells": {"B2": 1}, "student_range": "A1:A1"}
        })


def test_dataframe_conversion_is_sparse_json_safe_and_offset() -> None:
    dataframe = pd.DataFrame(
        [[np.int64(2), "=C3*2"], [pd.NA, np.float64(3.5)]],
        columns=["quantity", "formula"],
        index=["first", "second"],
    )

    sheet = psp.dataframe_to_spreadsheet_sheet(
        dataframe, name="Inputs", start_cell="C3"
    )
    assert sheet == {
        "name": "Inputs",
        "rows": 4,
        "columns": 4,
        "cells": {"C3": 2, "D3": "=C3*2", "D4": 3.5},
        "editable_ranges": [],
    }

    labeled = psp.dataframe_to_spreadsheet_sheet(
        dataframe,
        start_cell="B2",
        include_columns=True,
        include_index=True,
        editable_ranges=("C3:D4",),
    )
    assert labeled["cells"] == {
        "C2": "quantity",
        "D2": "formula",
        "B3": "first",
        "B4": "second",
        "C3": 2,
        "D3": "=C3*2",
        "D4": 3.5,
    }
    assert labeled.get("editable_ranges") == ["C3:D4"]


@pytest.mark.parametrize(
    "value", [float("inf"), 1 + 2j, {"nested": True}, datetime.date(2024, 1, 1)]
)
def test_dataframe_conversion_rejects_non_json_cell_values(value: object) -> None:
    with pytest.raises((TypeError, ValueError), match="Spreadsheet value"):
        psp.dataframe_to_spreadsheet_sheet(pd.DataFrame([[value]]))


def test_dataframe_conversion_rejects_requested_multi_index_labels() -> None:
    columns = pd.DataFrame(
        [[1]], columns=pd.MultiIndex.from_tuples([("group", "value")])
    )
    index = pd.DataFrame([[1]], index=pd.MultiIndex.from_tuples([("group", "row")]))

    with pytest.raises(TypeError, match="column labels"):
        psp.dataframe_to_spreadsheet_sheet(columns, include_columns=True)
    with pytest.raises(TypeError, match="index labels"):
        psp.dataframe_to_spreadsheet_sheet(index, include_index=True)


def test_dataframe_book_rejects_case_insensitive_sheet_collisions() -> None:
    frames = {"Inputs": pd.DataFrame([[1]]), "inputs": pd.DataFrame([[2]])}

    with pytest.raises(ValueError, match="duplicated"):
        psp.dataframes_to_spreadsheet_book(frames)


def test_public_file_readers_load_csv_tsv_and_xlsx(tmp_path: Path) -> None:
    csv_path = tmp_path / "input.csv"
    csv_path.write_text("2,=A1*2\n,NA\n")
    tsv_path = tmp_path / "input.tsv"
    tsv_path.write_text("2\t=A1*2\n\tNA\n")

    for source, reader in (
        (csv_path, psp.read_spreadsheet_csv),
        (tsv_path, psp.read_spreadsheet_tsv),
    ):
        book = reader(source, sheet_name="Inputs")
        assert book["sheets"][0]["cells"] == {
            "A1": "2",
            "B1": "=A1*2",
            "B2": "NA",
        }

    xlsx_path = tmp_path / "input.xlsx"
    # New workbooks always start with a sheet named Sheet1.
    workbook = Workbook()
    workbook.set_value("Sheet1", 1, 1, 2)
    workbook.set_value("Sheet1", 1, 2, 2.5)
    workbook.set_formula("Sheet1", 1, 3, "=A1*2")
    workbook.set_formula("Sheet1", 4, 5, "=SUM(A1:C1)")
    workbook.add_sheet("Checks")
    workbook.set_formula("Checks", 1, 1, "=Sheet1!C1=4")
    xlsx_path.write_bytes(workbook.to_xlsx_bytes())

    book = psp.read_spreadsheet(xlsx_path)
    assert [sheet["name"] for sheet in book["sheets"]] == ["Sheet1", "Checks"]
    assert book["sheets"][0]["cells"] == {
        "A1": 2,
        "B1": 2.5,
        "C1": "=A1*2",
        "E4": "=SUM(A1:C1)",
    }
    assert (book["sheets"][0]["rows"], book["sheets"][0]["columns"]) == (4, 5)
    assert book["sheets"][1]["cells"] == {"A1": "=Sheet1!C1=4"}


def test_sparse_cells_data_contains_valid_cells() -> None:
    cells = psp._SparseSheet(
        name="Input Data",
        rows=3,
        columns=4,
        visible_range=psp.AddressRange.from_a1("A1:D3"),
        addressed_data={},
    )

    assert psp.Address(row=0, column=0) in cells
    assert psp.Address(row=2, column=3) in cells
    assert psp.Address(row=3, column=3) not in cells
    assert psp.QualifiedAddress(psp.Address(row=2, column=3), "Input Data") in cells
    assert psp.QualifiedAddress(psp.Address(row=2, column=3), "Other") not in cells


def test_queries_cells_formulas_and_outputs() -> None:
    workbook = snapshot()

    assert psp.get_spreadsheet_cell(workbook, "Inputs", "a1") == {
        "input": {"type": "number", "value": 3},
        "result": {"type": "number", "value": 3},
    }
    assert psp.get_spreadsheet_cell(workbook, "Inputs", "A2") is None
    assert psp.get_spreadsheet_result(workbook, "Inputs", "A2") == {"type": "empty"}
    assert psp.get_spreadsheet_value(workbook, "Inputs", "B1") == 6
    assert psp.get_spreadsheet_value(workbook, "Inputs", "C1") is None
    assert psp.get_spreadsheet_formula(workbook, "Inputs", "B1") == "=A1*2"
    assert psp.get_spreadsheet_formula(workbook, "Inputs", "A1") is None
    assert psp.get_spreadsheet_grading_output(workbook, "total") == {
        "type": "number",
        "value": 6,
    }


def test_query_errors_are_explicit() -> None:
    workbook = snapshot()

    with pytest.raises(KeyError, match="Unknown spreadsheet sheet"):
        psp.get_spreadsheet_cell(workbook, "Missing", "A1")
    with pytest.raises(ValueError, match="outside the sheet"):
        psp.get_spreadsheet_cell(workbook, "Inputs", "D1")
    with pytest.raises(ValueError, match="Invalid spreadsheet cell address"):
        psp.get_spreadsheet_cell(workbook, "Inputs", "not-a-cell")
    with pytest.raises(KeyError, match="Unknown spreadsheet grading output"):
        psp.get_spreadsheet_grading_output(workbook, "missing")
    workbook.pop("grading")
    with pytest.raises(KeyError, match="does not contain private grading outputs"):
        psp.get_spreadsheet_grading_output(workbook, "total")


def test_spreadsheet_wrapper_addresses_cells_and_sheets() -> None:
    workbook = psp.Book(snapshot())

    assert workbook.sheet_names == ("Inputs", "Input Data", "Bob's Data")
    inputs = workbook["Inputs"]
    assert isinstance(inputs, psp.Sheet)
    assert inputs.book is workbook
    assert inputs.name == "Inputs"
    assert inputs.shape == (3, 3)
    assert inputs.rows == 3
    assert inputs.columns == 3

    cell = inputs.cell("a1")
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
    assert cell.error_type is None
    assert cell.error_value is None

    empty = inputs["A2"]
    assert isinstance(empty, psp.Cell)
    assert empty.input is None
    assert empty.result == {"type": "empty"}
    assert empty.value is None
    assert empty.is_empty
    assert not empty.is_error
    assert empty.error_type is None
    assert empty.error_value is None

    error = inputs.cell("C1")
    assert error.value is None
    assert not error.is_empty
    assert error.is_error
    assert error.error_type == "DIV_BY_ZERO"
    assert error.error_value == "#DIV/0!"


def test_spreadsheet_address_space_translates_bounded_addresses_and_ranges() -> None:
    space = psp.AddressSpace.from_source_range("C5:F20")

    assert space.shape == (16, 4)
    assert space.student_range.address == "A1:D16"
    assert space.to_student_address("C5").address == "A1"
    assert space.to_student_address("D6").address == "B2"
    assert space.to_source_address("D16").address == "F20"
    assert space.to_student_range("D6:F8").address == "B2:D4"
    assert space.to_source_range("B2:D4").address == "D6:F8"

    with pytest.raises(ValueError, match="outside"):
        space.to_student_address("B5")
    with pytest.raises(ValueError, match="outside"):
        space.to_source_address("E1")


def test_rebase_spreadsheet_formula_uses_student_local_coordinates() -> None:
    spaces = psp.AddressSpaceMap({"Inputs": "C5:F20", "Rates": "B2:C10"})

    assert (
        psp.rebase_spreadsheet_formula(
            "=$C5*D$6+Rates!$B$2",
            current_sheet="Inputs",
            address_spaces=spaces,
        )
        == "=$A1*B$2+Rates!$A$1"
    )
    assert (
        psp.rebase_spreadsheet_formula(
            "=SUM(C:F,5:20)",
            current_sheet="Inputs",
            address_spaces=spaces,
        )
        == "=SUM(A:D,1:16)"
    )
    with pytest.raises(ValueError, match="outside"):
        psp.rebase_spreadsheet_formula(
            "=B5",
            current_sheet="Inputs",
            address_spaces=spaces,
        )


def test_spreadsheet_validates_and_copies_snapshot_at_construction() -> None:
    old_snapshot = cast(psp.Snapshot, {**snapshot(), "schema_version": 1})
    with pytest.raises(ValueError, match="schema version 2"):
        psp.Book(old_snapshot)
    with pytest.raises(ValueError, match="schema version 2"):
        psp.get_spreadsheet_cell(old_snapshot, "Inputs", "A1")

    invalid_input = snapshot()
    invalid_input["sheets"][0]["cells"]["A1"]["input"] = cast(
        psp.Input,
        {"type": "number", "value": "not a number"},
    )
    with pytest.raises(TypeError, match="invalid input"):
        psp.Book(invalid_input)

    invalid_output = snapshot()
    snapshot_grading(invalid_output)["outputs"]["total"] = cast(
        psp.Result,
        {"type": "number", "value": "not a number"},
    )
    with pytest.raises(TypeError, match="invalid result"):
        psp.Book(invalid_output)

    original = snapshot()
    workbook = psp.Book(original)
    original_result = original["sheets"][0]["cells"]["A1"]["result"]
    assert original_result["type"] == "number"
    original_result["value"] = 99
    assert workbook["Inputs"].cell("A1").value == 3


def test_spreadsheet_wrapper_views_are_frozen_slots_dataclasses() -> None:
    workbook = psp.Book(snapshot())
    sheet = workbook["Inputs"]
    cell = sheet["A1"]
    cell_range = sheet["A1:B2"]
    assert isinstance(cell, psp.Cell)
    assert isinstance(cell_range, psp.CellRange)

    views = (
        workbook,
        sheet,
        cell,
        cell_range,
        workbook.outputs,
        workbook.outputs["total"],
    )
    assert all(is_dataclass(view) for view in views)
    assert all(not hasattr(view, "__dict__") for view in views)

    set_attribute = setattr
    with pytest.raises(FrozenInstanceError):
        set_attribute(sheet, "book", workbook)


def test_spreadsheet_wrapper_resolves_cross_sheet_references() -> None:
    workbook = psp.Book(snapshot())
    inputs = workbook["Inputs"]

    other_range = inputs.range("'Input Data'!A1:B2")
    assert other_range.sheet is workbook["Input Data"]
    assert other_range.range_address == "A1:B2"
    assert other_range.qualified_range_address == "'Input Data'!A1:B2"
    assert other_range.shape == (2, 2)
    assert not hasattr(other_range, "range")
    assert not hasattr(other_range, "start")
    assert not hasattr(other_range, "end")
    assert other_range.values == ((10, None), (None, 15))  # ruff: ignore[pandas-use-of-dot-values]
    assert other_range["B2"].value == 15
    assert other_range["'Input Data'!A1"].value == 10

    quoted_cell = inputs["'Bob''s Data'!A1"]
    assert isinstance(quoted_cell, psp.Cell)
    assert quoted_cell.value == "quoted"
    assert quoted_cell.qualified_address == "'Bob''s Data'!A1"

    with pytest.raises(TypeError, match="is not a cell"):
        inputs.cell("A1:B2")
    with pytest.raises(TypeError, match="is not a range"):
        inputs.range("A1")


@pytest.mark.parametrize(
    ("reference", "error"),
    [
        ("Inputs!A1:'Input Data'!B2", "cannot span multiple sheets"),
        ("A1:'Input Data'!B2", "cannot span multiple sheets"),
        ("B2:A1", "top-left to bottom-right"),
        ("'Input Data!A1", "Invalid spreadsheet reference"),
        ("A1:", "Invalid spreadsheet reference"),
        ("B:A", "top-left to bottom-right"),
        ("A:3", "Invalid spreadsheet range"),
        ("A1:B2:C3", "Invalid spreadsheet reference"),
    ],
)
def test_spreadsheet_wrapper_rejects_invalid_references(
    reference: str, error: str
) -> None:
    inputs = psp.Book(snapshot())["Inputs"]

    with pytest.raises(ValueError, match=error):
        inputs[reference]

    with pytest.raises(KeyError, match="Unknown spreadsheet sheet"):
        inputs["Missing!A1"]
    with pytest.raises(ValueError, match="outside the sheet"):
        inputs["D1"]


def test_spreadsheet_range_projections_queries_and_indexing() -> None:
    inputs = psp.Book(snapshot())["Inputs"]
    cell_range = inputs["A1:B2"]
    assert isinstance(cell_range, psp.CellRange)

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
    assert cell_range.values == ((3, 6), (None, None))  # ruff: ignore[pandas-use-of-dot-values]
    assert inputs.range("B1:C2").values == ((6, None), (None, None))  # ruff: ignore[pandas-use-of-dot-values]
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
    inputs = psp.Book(snapshot())["Inputs"]
    formula = inputs["B1"]
    assert isinstance(formula, psp.Cell)

    assert formula.formula == "=A1*2"
    assert formula.formula_ast == psp.parse_spreadsheet_formula("=A1*2")
    assert formula.matches_formula("=A1*2")
    assert not formula.matches_formula("=A1 * 2")
    assert formula.matches_formula("=A1 * 2", structural=True)
    assert not cast(psp.Cell, inputs["A1"]).matches_formula("=A1")

    with pytest.raises(psp.FormulaParseError):
        formula.matches_formula("not-a-formula", structural=True)

    invalid_snapshot = snapshot()
    invalid_snapshot["sheets"][0]["cells"]["B1"] = {
        "input": {"type": "formula", "value": "=named_expression"},
        "result": {"type": "error", "value": "#NAME?", "error_type": "NAME"},
    }
    invalid_formula = psp.Book(invalid_snapshot)["Inputs"].cell("B1")
    assert not invalid_formula.matches_formula("=A1*2", structural=True)


def test_spreadsheet_output_views() -> None:
    workbook = psp.Book(snapshot())

    assert tuple(workbook.outputs) == ("total", "failed_check")
    total = workbook.outputs["total"]
    assert total.name == "total"
    assert total.result == {"type": "number", "value": 6}
    assert total.value == 6
    assert not total.is_empty
    assert not total.is_error
    assert total.error_type is None
    assert total.error_value is None

    failed = workbook.outputs["failed_check"]
    assert failed.value is None
    assert not failed.is_empty
    assert failed.is_error
    assert failed.error_type == "NA"
    assert failed.error_value == "#N/A"

    empty_snapshot = snapshot()
    snapshot_grading(empty_snapshot)["outputs"]["empty_check"] = {"type": "empty"}
    empty = psp.Book(empty_snapshot).outputs["empty_check"]
    assert empty.value is None
    assert empty.is_empty
    assert not empty.is_error
    assert empty.error_type is None
    assert empty.error_value is None

    without_outputs = snapshot()
    without_outputs.pop("grading")
    outputs = psp.Book(without_outputs).outputs
    assert len(outputs) == 0
    with pytest.raises(KeyError, match="does not contain private grading outputs"):
        outputs["total"]


def test_formula_ast_respects_operator_precedence() -> None:
    ast = psp.parse_spreadsheet_formula("=A1+B2*C3^2")
    root = ast.root

    assert ast.schema_version == 1
    assert ast.formula == "=A1+B2*C3^2"
    assert isinstance(root, psp.FormulaBinaryNode)
    assert root.type == "binary"
    assert root.operator == "+"
    assert isinstance(root.right, psp.FormulaBinaryNode)
    assert root.right.operator == "*"
    assert isinstance(root.right.right, psp.FormulaBinaryNode)
    assert root.right.right.operator == "^"
    assert not hasattr(ast, "__dict__")
    assert not hasattr(root, "__dict__")
    set_attribute = setattr
    with pytest.raises(FrozenInstanceError):
        set_attribute(ast, "formula", "=1")


def test_formula_ast_preserves_formula_structure_and_references() -> None:
    ast = psp.parse_spreadsheet_formula("=IF('Sheet Name'!$A1:B$2>=3,\"ok\",)")
    root = ast.root

    assert isinstance(root, psp.FormulaFunctionNode)
    assert root.type == "function"
    assert root.name == "IF"
    assert len(root.arguments) == 3
    comparison = root.arguments[0]
    assert isinstance(comparison, psp.FormulaBinaryNode)
    assert comparison.operator == ">="
    reference_range = comparison.left
    assert isinstance(reference_range, psp.FormulaCellRangeNode)
    assert reference_range.start.kind == "cell"
    assert reference_range.start.row == 1
    assert reference_range.end.kind == "cell"
    assert reference_range.end.column == "B"
    assert reference_range == psp.FormulaCellRangeNode(
        start=psp.FormulaCellReference(
            sheet="Sheet Name",
            column="A",
            row=1,
            column_absolute=True,
            row_absolute=False,
        ),
        end=psp.FormulaCellReference(
            sheet=None,
            column="B",
            row=2,
            column_absolute=False,
            row_absolute=True,
        ),
    )
    assert isinstance(root.arguments[2], psp.FormulaEmptyNode)


def test_formula_ast_handles_unary_postfix_and_full_ranges() -> None:
    unary = psp.parse_spreadsheet_formula("=-A1%")
    assert isinstance(unary.root, psp.FormulaUnaryNode)
    assert isinstance(unary.root.operand, psp.FormulaPostfixNode)

    ranges = psp.parse_spreadsheet_formula("=SUM($A:$B,1:2)")
    assert isinstance(ranges.root, psp.FormulaFunctionNode)
    column_range = ranges.root.arguments[0]
    row_range = ranges.root.arguments[1]
    assert isinstance(column_range, psp.FormulaColumnRangeNode)
    assert isinstance(row_range, psp.FormulaRowRangeNode)
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
            psp.FormulaBinaryNode(
                operator="&",
                left=psp.FormulaGroupNode(
                    expression=psp.FormulaBinaryNode(
                        operator="+",
                        left=psp.FormulaLiteralNode(value_type="number", value=1),
                        right=psp.FormulaLiteralNode(value_type="number", value=2),
                    )
                ),
                right=psp.FormulaLiteralNode(value_type="string", value="x"),
            ),
        ),
        (
            "=TRUE=FALSE",
            psp.FormulaBinaryNode(
                operator="=",
                left=psp.FormulaLiteralNode(value_type="boolean", value=True),
                right=psp.FormulaLiteralNode(value_type="boolean", value=False),
            ),
        ),
        (
            "=#N/A",
            psp.FormulaLiteralNode(value_type="error", value="#N/A"),
        ),
        (
            "=sum(A1)",
            psp.FormulaFunctionNode(
                name="SUM",
                arguments=(
                    psp.FormulaReferenceNode(
                        reference=psp.FormulaCellReference(
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
def test_formula_ast_golden_nodes(formula: str, expected: psp.FormulaAstNode) -> None:
    assert psp.parse_spreadsheet_formula(formula).root == expected


def test_get_formula_ast_and_invalid_formula() -> None:
    ast = psp.get_spreadsheet_formula_ast(snapshot(), "Inputs", "B1")
    assert ast is not None
    assert ast.formula == "=A1*2"
    assert psp.get_spreadsheet_formula_ast(snapshot(), "Inputs", "A1") is None

    with pytest.raises(psp.FormulaParseError, match="must start"):
        psp.parse_spreadsheet_formula("A1+1")
    with pytest.raises(psp.FormulaParseError, match="Unsupported"):
        psp.parse_spreadsheet_formula("=named_expression")
    with pytest.raises(psp.FormulaParseError, match="incompatible endpoint"):
        psp.parse_spreadsheet_formula("=A1:B")


def test_create_spreadsheet_adds_parameters_test_cases_and_reference() -> None:
    book = psp.create_spreadsheet(
        {"Bob's Data": {"A1": 1}},
        reference={
            "'Bob''s Data'!b2": "=A1*2",
            "'Bob''s Data'!C2": {"value": "=A1*3", "rtol": 1e-6},
        },
        parameters=["'Bob''s Data'!a1:a3"],
        test_cases=[{"name": "zero", "inputs": {"'Bob''s Data'!a1": np.int64(0)}}],
        rtol=0.05,
        compare_outputs=True,
    )

    assert book["outputs"] == {}
    assert book.get("parameters") == ["'Bob''s Data'!A1:A3"]
    assert book.get("test_cases") == [
        {"name": "zero", "inputs": {"'Bob''s Data'!A1": 0}}
    ]
    assert book.get("reference") == {
        "cells": {
            "'Bob''s Data'!B2": {"value": "=A1*2"},
            "'Bob''s Data'!C2": {"value": "=A1*3", "rtol": 1e-6},
        },
        "rtol": 0.05,
        "compare_outputs": True,
    }


def test_create_spreadsheet_rejects_invalid_testing_options() -> None:
    with pytest.raises(ValueError, match="require a reference solution"):
        psp.create_spreadsheet({"Inputs": {}}, outputs={"x": "Inputs!A1"}, rtol=0.1)
    with pytest.raises(ValueError, match="require outputs or a reference"):
        psp.create_spreadsheet({"Inputs": {}}, test_cases=cast(Any, []))
    with pytest.raises(ValueError, match="must be sheet-qualified"):
        psp.create_spreadsheet({"Inputs": {}}, reference={"B2": "=A1"})
    with pytest.raises(ValueError, match="must not be empty"):
        psp.create_spreadsheet({"Inputs": {}}, reference={"Inputs!B2": ""})
    with pytest.raises(ValueError, match="non-negative finite"):
        psp.create_spreadsheet(
            {"Inputs": {}}, reference={"Inputs!B2": {"value": "=A1", "atol": -1}}
        )
    with pytest.raises(ValueError, match="more than once"):
        psp.create_spreadsheet(
            {"Inputs": {}},
            outputs={"x": "Inputs!A1"},
            test_cases=[{"inputs": {"Inputs!A1": 1, "Inputs!a1": 2}}],
        )


def test_random_cases_are_deterministic_for_the_seeded_variant() -> None:
    inputs: dict[str, psp.RandomInput] = {
        "Inputs!A2": (1, 10),
        "Inputs!B2": (0.5, 1.5),
        "Inputs!C2": ["low", "high"],
        "Inputs!D2": lambda address: address.local.row * 10,
        "Inputs!E2:E3": (0.05, 0.09, 0.0025),
    }
    random.seed(1234)
    first = psp.random_cases(5, inputs)
    random.seed(1234)
    assert psp.random_cases(5, inputs) == first

    assert [case.get("name") for case in first] == [
        f"Random case {i}" for i in range(1, 6)
    ]
    for case in first:
        values = case["inputs"]
        assert isinstance(values["Inputs!A2"], int)
        assert 1 <= values["Inputs!A2"] <= 10
        assert isinstance(values["Inputs!B2"], float)
        assert 0.5 <= values["Inputs!B2"] <= 1.5
        assert values["Inputs!C2"] in {"low", "high"}
        assert values["Inputs!D2"] == 10
        for address in ("Inputs!E2", "Inputs!E3"):
            rate = values[address]
            assert isinstance(rate, float)
            assert 0.05 <= rate <= 0.09
            assert rate == round(rate, 4)
            assert round((rate - 0.05) / 0.0025, 9).is_integer()
    assert psp.random_cases(1, {}, name="Case {index}") == [
        {"name": "Case 1", "inputs": {}}
    ]

    with pytest.raises(ValueError, match="between 0 and 50"):
        psp.random_cases(51, {})
    with pytest.raises(TypeError, match="must be a"):
        psp.random_cases(1, {"Inputs!A2": cast(psp.RandomInput, "abc")})
    with pytest.raises(ValueError, match="positive step"):
        psp.random_cases(1, {"Inputs!A2": (1, 10, 0)})
    with pytest.raises(ValueError, match="sheet-qualified"):
        psp.random_cases(1, {"A2": (1, 10)})


def test_stepped_random_inputs_keep_integers_and_reach_the_upper_bound() -> None:
    random.seed(7)
    values = {
        value
        for case in psp.random_cases(50, {"Inputs!A1": (1_000, 1_500, 250)})
        for value in case["inputs"].values()
    }
    assert values == {1_000, 1_250, 1_500}
    # A three-number list is choices, not a stepped range.
    random.seed(7)
    choices = {
        value
        for case in psp.random_cases(50, {"Inputs!A1": [25, 45, 65]})
        for value in case["inputs"].values()
    }
    assert choices == {25, 45, 65}


VOLATILE: psp.VolatileSpec = {
    "Orders!B2:B3": (10, 99),
    "Orders!C2:C3": (0.05, 0.09, 0.0025),
}


def order_sheet() -> dict[str, object]:
    return {
        "cells": {"A1": "Order", "B1": "Subtotal", "B2": 1, "D2": "=B2*C2"},
        "editable_ranges": ["D2:D3"],
    }


def test_create_spreadsheet_samples_and_marks_volatile_ranges() -> None:
    random.seed(1)
    book = psp.create_spreadsheet({"Orders": order_sheet()}, volatile=VOLATILE)
    sheet = book["sheets"][0]
    assert sheet.get("volatile_ranges") == ["B2:B3", "C2:C3"]
    assert sheet.get("editable_ranges") == ["D2:D3"]
    for address in ("B2", "B3"):
        assert isinstance(sheet["cells"][address], int)
    for address in ("C2", "C3"):
        assert 0.05 <= cast(float, sheet["cells"][address]) <= 0.09
    assert sheet["cells"]["A1"] == "Order"

    random.seed(1)
    again = psp.create_spreadsheet({"Orders": order_sheet()}, volatile=VOLATILE)
    assert again == book


def test_create_spreadsheet_appends_randomized_cases_after_explicit_ones() -> None:
    book = psp.create_spreadsheet(
        reference={"Orders!D2": "=B2*C2"},
        test_cases=[{"name": "zero subtotal", "inputs": {"Orders!B2": 0}}],
        volatile=VOLATILE,
        volatile_cases=3,
    )
    cases = book.get("test_cases", [])
    assert [case.get("name") for case in cases] == [
        "zero subtotal",
        "Randomized case 1",
        "Randomized case 2",
        "Randomized case 3",
    ]
    assert set(cases[1]["inputs"]) == {
        "Orders!B2",
        "Orders!B3",
        "Orders!C2",
        "Orders!C3",
    }
    assert book.get("volatile", []) == ["Orders!B2:B3", "Orders!C2:C3"]

    default = psp.create_spreadsheet(reference={"Orders!D2": "=B2"}, volatile=VOLATILE)
    assert len(default.get("test_cases", [])) == 8


def test_volatile_block_generators_sample_correlated_cells() -> None:
    def correlated() -> dict[str, object]:
        base = random.randint(1, 9)
        return {"Data!A1": base, "Data!A2": base * 2, "Other!B1": "high"}

    spec: psp.VolatileSpec = {("Data!A1:A2", "Other!B1"): psp.block(correlated)}
    book = psp.create_spreadsheet({"Data": {}, "Other": {"A1": "Label"}}, volatile=spec)
    data, other = book["sheets"]
    assert data["cells"]["A2"] == 2 * cast(int, data["cells"]["A1"])
    assert data.get("volatile_ranges") == ["A1:A2"]
    assert other["cells"] == {"A1": "Label", "B1": "high"}
    assert other.get("volatile_ranges") == ["B1:B1"]

    grading = psp.create_spreadsheet(
        reference={"Data!B1": "=A1"}, volatile=spec, volatile_cases=2
    )
    for case in grading.get("test_cases", []):
        inputs = case["inputs"]
        assert inputs["Data!A2"] == 2 * cast(int, inputs["Data!A1"])

    with pytest.raises(ValueError, match="outside its volatile ranges"):
        psp.create_spreadsheet(
            {"Data": {}},
            volatile={"Data!A1": psp.block(lambda: {"Data!A3": 1})},
        )
    with pytest.raises(ValueError, match="requires a block"):
        psp.create_spreadsheet(
            {"Data": {}, "Other": {}}, volatile={("Data!A1", "Other!A1"): (1, 2)}
        )


def test_volatile_ranges_are_validated() -> None:
    with pytest.raises(ValueError, match="overlaps editable range"):
        psp.create_spreadsheet(
            {"Orders": order_sheet()}, volatile={"Orders!D2": (1, 2)}
        )
    with pytest.raises(ValueError, match="overlap"):
        psp.create_spreadsheet(
            {"Orders": {}},
            volatile={"Orders!A1:A3": (1, 2), "Orders!A3:A4": (1, 2)},
        )
    with pytest.raises(ValueError, match="unknown sheet"):
        psp.create_spreadsheet({"Orders": {}}, volatile={"Missing!A1": (1, 2)})
    with pytest.raises(ValueError, match="constant"):
        psp.create_spreadsheet({"Orders": {}}, volatile={"Orders!A1": ["=1+1"]})
    with pytest.raises(ValueError, match="constant"):
        psp.create_spreadsheet({
            "Orders": {"cells": {"A1": "=1"}, "volatile_ranges": ["A1"]}
        })
    with pytest.raises(ValueError, match="closed"):
        psp.create_spreadsheet({"Orders": {}}, volatile={"Orders!A1:A": (1, 2)})
    with pytest.raises(ValueError, match="volatile_cases requires"):
        psp.create_spreadsheet(
            {"Orders": {}},
            volatile={"Orders!A1": (1, 2)},
            volatile_cases=cast(None, 2),
        )
    with pytest.raises(ValueError, match="between 0 and 50"):
        psp.create_spreadsheet(
            reference={"Orders!B1": "=A1"},
            volatile={"Orders!A1": (1, 2)},
            volatile_cases=51,
        )


def test_dataframe_sheets_can_mark_volatile_ranges() -> None:
    sheet = psp.dataframe_to_spreadsheet_sheet(
        pd.DataFrame({"x": [1, 2]}), volatile_ranges=["A1:A2"]
    )
    assert sheet.get("volatile_ranges") == ["A1:A2"]
    assert "volatile_ranges" not in psp.dataframe_to_spreadsheet_sheet(
        pd.DataFrame({"x": [1]})
    )


def comparison(
    student: float, reference: float, *, match: bool
) -> psp.SnapshotComparison:
    return {
        "student": {"type": "number", "value": student},
        "reference": {"type": "number", "value": reference},
        "match": match,
    }


def graded_snapshot() -> psp.Snapshot:
    spreadsheet_snapshot = snapshot()
    grading = snapshot_grading(spreadsheet_snapshot)
    grading["cases"] = [
        {"name": "zero", "outputs": {"total": {"type": "number", "value": 0}}},
        {"name": "large", "outputs": {"total": {"type": "number", "value": 600}}},
    ]
    grading["reference"] = {
        "cells": {
            "Inputs!B1": {
                "base": comparison(6, 6, match=True),
                "cases": [
                    comparison(6, 0, match=False),
                    comparison(600, 600, match=True),
                ],
            }
        },
        "summary": {"matched": 2, "total": 3},
    }
    return spreadsheet_snapshot


def private_grading_config() -> dict[str, object]:
    return {
        "grader_hash": "grader-hash",
        "test_cases": [
            {"name": "zero", "inputs": [{"sheet": "Inputs", "cell": "A1", "value": 0}]},
            {
                "name": "large",
                "inputs": [{"sheet": "Inputs", "cell": "A1", "value": 300}],
            },
        ],
    }


def test_book_exposes_test_cases_and_reference_comparisons() -> None:
    book = psp.Book(graded_snapshot(), grading=private_grading_config())

    assert [case.name for case in book.cases] == ["zero", "large"]
    assert book.cases[1].value("total") == 600
    assert book.cases[0].inputs == {"Inputs!A1": 0}

    assert book.has_reference
    series = book.reference["Inputs!b1"]
    assert series.match_rate == pytest.approx(2 / 3)
    assert not series.all_match
    mismatch = series.first_mismatch
    assert mismatch is not None
    assert mismatch.case is book.cases[0]
    assert (mismatch.student_value, mismatch.reference_value) == (6, 0)
    assert series.base.case is None
    assert list(book.reference) == ["Inputs!B1"]
    assert book.reference.outputs == {}
    assert book.reference.score() == pytest.approx(2 / 3)


def test_book_case_inputs_require_the_matching_private_config() -> None:
    assert psp.Book(graded_snapshot()).cases[0].inputs is None

    mismatched = {**private_grading_config(), "grader_hash": "other"}
    with pytest.raises(ValueError, match="does not match this snapshot"):
        psp.Book(graded_snapshot(), grading=mismatched)


def test_book_reference_errors_are_explicit() -> None:
    book = psp.Book(snapshot())
    assert book.cases == ()
    assert not book.has_reference
    with pytest.raises(ValueError, match="does not contain reference comparisons"):
        _ = book.reference

    graded = psp.Book(graded_snapshot())
    with pytest.raises(KeyError, match="not a spreadsheet reference cell"):
        graded.reference["Inputs!C1"]
    with pytest.raises(KeyError, match="must be sheet-qualified"):
        graded.reference["B1"]

    invalid = graded_snapshot()
    reference = snapshot_grading(invalid).get("reference")
    assert reference is not None
    reference["cells"]["Inputs!B1"]["cases"].pop()
    with pytest.raises(ValueError, match="one comparison per test case"):
        psp.Book(invalid)


@pytest.mark.parametrize(
    ("range_text", "expected"),
    [
        ("B2:B", "B2:B10"),
        ("b2:c", "B2:C10"),
        ("B:B2", "B2:B10"),
        ("A:C", "A1:C10"),
        ("3:5", "A3:D5"),
        ("B3:3", "B3:D3"),
        ("B2:C4", "B2:C4"),
    ],
)
def test_address_ranges_resolve_open_ended_endpoints_against_bounds(
    range_text: str, expected: str
) -> None:
    bounds = psp.AddressRange.from_a1("A1:D10")
    assert psp.AddressRange.from_a1(range_text, bounds=bounds).address == expected


def test_address_ranges_reject_unresolvable_open_ended_ranges() -> None:
    with pytest.raises(ValueError, match="needs sheet bounds"):
        psp.AddressRange.from_a1("B2:B")
    bounds = psp.AddressRange.from_a1("B2:D10")
    with pytest.raises(ValueError, match="outside B2:D10"):
        psp.AddressRange.from_a1("A2:A", bounds=bounds)
    with pytest.raises(ValueError, match="Invalid spreadsheet range"):
        psp.AddressRange.from_a1("A:3", bounds=bounds)
    with pytest.raises(ValueError, match="Invalid spreadsheet cell address"):
        psp.AddressRange.from_a1("A", bounds=bounds)

    space = psp.AddressSpace.from_source_range("C5:F20")
    assert space.to_student_range("D6:D").address == "B2:B16"
    assert space.to_source_range("B:B").address == "D5:D20"


def test_create_spreadsheet_resolves_open_ended_sheet_ranges() -> None:
    book = psp.create_spreadsheet({
        "Inputs": {
            "cells": {"A1": "Quantity"},
            "rows": 20,
            "columns": 6,
            "student_range": "A1:D",
            "editable_ranges": ["B2:B", "C:C"],
        },
        "Inferred": {"cells": {"C4": 1}, "editable_ranges": ["A2:B"]},
    })

    inputs, inferred = book["sheets"]
    assert inputs.get("student_range") == "A1:D20"
    assert inputs.get("editable_ranges") == ["B2:B20", "C1:C20"]
    assert (inferred["rows"], inferred["columns"]) == (4, 3)
    assert inferred.get("editable_ranges") == ["A2:B4"]

    with pytest.raises(ValueError, match='Invalid editable range "E2:E"'):
        psp.create_spreadsheet({
            "Inputs": {"rows": 5, "columns": 6, "student_range": "A1:D"},
            "Other": {"editable_ranges": ["E2:E"], "rows": 2, "columns": 2},
        })


def test_create_spreadsheet_keeps_open_ended_parameters_for_the_element() -> None:
    book = psp.create_spreadsheet(
        outputs={"total": "Checks!A1"},
        parameters=["'Input Data'!a2:a", "Inputs!B2:C3"],
    )
    assert book["sheets"] == []
    assert book.get("parameters") == ["'Input Data'!A2:A", "Inputs!B2:C3"]

    with pytest.raises(ValueError, match="is invalid"):
        psp.create_spreadsheet(
            outputs={"total": "Checks!A1"}, parameters=["Inputs!A:3"]
        )


def test_create_spreadsheet_builds_reference_only_grading_books() -> None:
    book = psp.create_spreadsheet(reference={"Inputs!B2": "=A2*2"}, atol=0)
    assert book == {
        "schema_version": 2,
        "sheets": [],
        "outputs": {},
        "reference": {"cells": {"Inputs!B2": {"value": "=A2*2"}}, "atol": 0.0},
    }
    with pytest.raises(ValueError, match="must contain 1 to 10 sheets"):
        psp.create_spreadsheet({})


def test_spreadsheet_wrapper_resolves_open_ended_ranges() -> None:
    inputs = psp.Book(snapshot())["Inputs"]

    assert inputs.range("B1:B").range_address == "B1:B3"
    assert inputs.range("A:A").range_address == "A1:A3"
    assert inputs.range("1:1").range_address == "A1:C1"
    assert inputs.range("'Input Data'!A1:B").qualified_range_address == (
        "'Input Data'!A1:B2"
    )
    with pytest.raises(ValueError, match="outside A1:C3"):
        inputs.range("D1:D")


@pytest.mark.parametrize(
    ("formula", "rows", "columns", "expected"),
    [
        ("=ABS(B2-$C1)", 0, 1, "=ABS(C2-$C1)"),
        ("=ABS(B2-$C1)", 1, 0, "=ABS(B3-$C2)"),
        ("=$B$2+B$2+$B2", 2, 3, "=$B$2+E$2+$B4"),
        ("=SUM(A2:B3, C:C, 4:4)", 1, 1, "=SUM(B3:C4, D:D, 5:5)"),
        ("=SUM($A:A)", 0, 2, "=SUM($A:C)"),
        ("='Weekly Sales'!B2*Rates!$A$1", 1, 0, "='Weekly Sales'!B3*Rates!$A$1"),
        ('=IF(A1>0,"A1",A1)&TRUE', 0, 1, '=IF(B1>0,"A1",B1)&TRUE'),
        ("=Z1", 0, 1, "=AA1"),
        ("=PI()", 5, 5, "=PI()"),
    ],
)
def test_shift_formula_moves_relative_references(
    formula: str, rows: int, columns: int, expected: str
) -> None:
    assert psp.shift_formula(formula, rows=rows, columns=columns) == expected


def test_shift_formula_rejects_invalid_shifts() -> None:
    with pytest.raises(ValueError, match="above row 1"):
        psp.shift_formula("=B2+A1", rows=-1)
    with pytest.raises(ValueError, match="left of column A"):
        psp.shift_formula("=B2", columns=-2)
    assert psp.shift_formula("=$A$1", rows=-5, columns=-5) == "=$A$1"
    with pytest.raises(psp.FormulaParseError, match='must start with "="'):
        psp.shift_formula("B2")


def test_fill_formula_fills_down_right_and_from_an_origin() -> None:
    assert psp.fill_formula("Forecast!D4:D6", "=ABS(B4-C4)") == {
        "Forecast!D4": "=ABS(B4-C4)",
        "Forecast!D5": "=ABS(B5-C5)",
        "Forecast!D6": "=ABS(B6-C6)",
    }
    assert psp.fill_formula("D2:E3", "=ABS(B2-$C1)") == {
        "D2": "=ABS(B2-$C1)",
        "E2": "=ABS(C2-$C1)",
        "D3": "=ABS(B3-$C2)",
        "E3": "=ABS(C3-$C2)",
    }
    assert psp.fill_formula("'Weekly Sales'!C2:E2", "=E1*2", origin="E2") == {
        "'Weekly Sales'!C2": "=C1*2",
        "'Weekly Sales'!D2": "=D1*2",
        "'Weekly Sales'!E2": "=E1*2",
    }
    with pytest.raises(ValueError, match="above row 1"):
        psp.fill_formula("A1:A2", "=A1", origin="A2")


def student_overlay(source_range: str) -> dict[str, str]:
    return {
        "student_sheet": "Inputs",
        "source_sheet": "Inputs",
        "source_range": source_range,
    }


def test_book_maps_source_addresses_to_student_cells() -> None:
    grading = {
        **private_grading_config(),
        "student_overlays": [student_overlay("C5:E7")],
    }
    book = psp.Book(graded_snapshot(), grading=grading)

    cell = book.student_cell("Inputs!D5")
    assert (cell.qualified_address, cell.formula) == ("Inputs!B1", "=A1*2")
    with pytest.raises(ValueError, match="outside every student range"):
        book.student_cell("Inputs!A1")
    with pytest.raises(ValueError, match="outside every student range"):
        book.student_cell("Missing!A1")
    with pytest.raises(ValueError, match="Pass grading="):
        psp.Book(snapshot()).student_cell("Inputs!D5")


def set_reference_cells(
    spreadsheet_snapshot: psp.Snapshot,
    cells: dict[str, list[bool]],
) -> psp.Snapshot:
    reference = snapshot_grading(spreadsheet_snapshot).get("reference")
    assert reference is not None
    reference["cells"] = {
        address: {
            "base": comparison(1, 1, match=matches[0]),
            "cases": [comparison(1, 1, match=match) for match in matches[1:]],
        }
        for address, matches in cells.items()
    }
    return spreadsheet_snapshot


def test_reference_cell_score_requires_every_run_to_match() -> None:
    book = psp.Book(
        set_reference_cells(
            graded_snapshot(),
            {"Inputs!A1": [True, True, True], "Inputs!B1": [True, False, True]},
        )
    )
    assert book.reference.cell_score() == pytest.approx(0.5)
