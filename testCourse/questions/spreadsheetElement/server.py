from typing import Any

import prairielearn as pl


def generate(data: dict[str, Any]) -> None:
    data["params"]["workbook"] = {
        "schema_version": 1,
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
                "name": "Summary",
                "rows": 2,
                "columns": 2,
                "cells": {"A1": "Total", "B1": "=SUM(Inputs!D2:D4)"},
                "editable_ranges": [],
            },
        ],
    }
    data["correct_answers"]["model"] = {
        "schema_version": 1,
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


def grade(data: dict[str, Any]) -> None:
    workbook = pl.SpreadsheetBook(data["submitted_answers"]["model"])
    inputs = workbook["Summary"].range("Inputs!B2:D2")
    line_total = inputs["D2"]
    correct = (
        inputs["B2"].value == 3
        and inputs["C2"].value == 4
        and line_total.formula == "=B2*C2"
        and line_total.matches_formula("=B2*C2", structural=True)
        and line_total.value == 12
        and workbook.outputs["line_total"].value == 12
        and workbook.outputs["total_is_correct"].value is True
    )
    data["score"] = 1 if correct else 0
