import pandas as pd
import prairielearn as pl
import prairielearn.spreadsheet_utils as psp


def generate(data: pl.QuestionData) -> None:
    data["params"]["workbook"] = {
        "schema_version": 2,
        "sheets": [
            {
                "name": "Inputs",
                "rows": 4,
                "columns": 4,
                "cells": {
                    "A1": "Item",
                    "B1": "Quantity",
                    "C1": "Unit price",
                    "D1": "Line total",
                    "A2": "Markers",
                    "B2": 1,
                    "C2": 2,
                    "D2": "=B2*C2",
                },
                "editable_ranges": ["B2:D4"],
            },
            {
                **psp.dataframe_to_spreadsheet_sheet(
                    pd.DataFrame([["=SUM(Inputs!D2:D4)"]]),
                    name="Summary",
                    start_cell="B1",
                ),
                "student_range": "B1:B1",
            },
        ],
    }
    data["correct_answers"]["model"] = {
        "schema_version": 2,
        "sheets": [
            {
                "name": "Checks",
                "rows": 2,
                "columns": 1,
                "cells": {"A1": "=Inputs!D2", "A2": "=A1=12"},
            }
        ],
        "outputs": {
            "line_total": {"sheet": "Checks", "cell": "A1"},
            "total_is_correct": {"sheet": "Checks", "cell": "A2"},
        },
    }


def grade(data: pl.QuestionData) -> None:
    workbook = psp.Book(data["submitted_answers"]["model"])
    inputs = workbook["Summary"].range("Inputs!B2:D2")
    line_total = inputs["D2"]
    parameter_workbook_correct = (
        inputs["B2"].value == 3
        and inputs["C2"].value == 4
        and line_total.formula == "=B2*C2"
        and line_total.matches_formula("=B2*C2", structural=True)
        and line_total.value == 12
        and workbook.outputs["line_total"].value == 12
        and workbook.outputs["total_is_correct"].value is True
    )

    csv_workbook = psp.Book(data["submitted_answers"]["csv_model"])
    csv_budget = csv_workbook["CsvBudget"]
    csv_workbook_correct = (
        csv_budget.cell("A1").value == 3
        and csv_budget.cell("B1").value == 4
        and csv_budget.cell("C1").formula == "=A1*B1"
        and csv_workbook.outputs["is_correct"].value is True
    )

    tsv_workbook = psp.Book(data["submitted_answers"]["tsv_model"])
    tsv_workbook_correct = (
        tsv_workbook["Rates"].cell("C1").value == 10
        and tsv_workbook["RateSummary"].cell("B1").value == 22
        and tsv_workbook.outputs["is_correct"].value is True
    )

    xlsx_workbook = psp.Book(data["submitted_answers"]["xlsx_model"])
    xlsx_workbook_correct = (
        xlsx_workbook["XlsxInputs"].cell("C1").value == 10
        and xlsx_workbook["XlsxSummary"].cell("B1").value == 22
        and xlsx_workbook.outputs["is_correct"].value is True
    )

    data["partial_scores"]["model"] = {
        "score": int(parameter_workbook_correct),
        "weight": 1,
    }
    data["partial_scores"]["csv_model"] = {
        "score": int(csv_workbook_correct),
        "weight": 1,
    }
    data["partial_scores"]["tsv_model"] = {
        "score": int(tsv_workbook_correct),
        "weight": 1,
    }
    data["partial_scores"]["xlsx_model"] = {
        "score": int(xlsx_workbook_correct),
        "weight": 1,
    }
    pl.set_weighted_score_data(data)
