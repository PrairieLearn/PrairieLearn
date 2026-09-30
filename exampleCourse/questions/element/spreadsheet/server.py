from typing import Any


def generate(data):
    data["params"]["workbook"] = {
        "schema_version": 1,
        "sheets": [
            {
                "name": "Inputs",
                "rows": 6,
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
                "editable_ranges": ["B2:D6"],
            },
            {
                "name": "Summary",
                "rows": 4,
                "columns": 2,
                "cells": {
                    "A1": "Budget total",
                    "B1": "=SUM(Inputs!D2:D6)",
                },
                "editable_ranges": [],
            },
        ],
    }


def _cell(snapshot: dict[str, Any], sheet_name: str, address: str) -> dict[str, Any]:
    sheet = next(sheet for sheet in snapshot["sheets"] if sheet["name"] == sheet_name)
    return sheet["cells"][address]


def grade(data):
    snapshot = data["submitted_answers"]["model"]
    quantity = _cell(snapshot, "Inputs", "B2")
    unit_price = _cell(snapshot, "Inputs", "C2")
    line_total = _cell(snapshot, "Inputs", "D2")
    summary_total = _cell(snapshot, "Summary", "B1")

    correct = (
        quantity["input"] == {"type": "number", "value": 3}
        and unit_price["input"] == {"type": "number", "value": 4}
        and line_total["input"] == {"type": "formula", "value": "=B2*C2"}
        and line_total["result"] == {"type": "number", "value": 12}
        and summary_total["result"] == {"type": "number", "value": 12}
    )
    data["score"] = 1 if correct else 0
    data["feedback"]["model"] = (
        "The formula input and both calculated values are correct."
        if correct
        else "Check the two inputs, the exact formula, and the calculated totals."
    )
