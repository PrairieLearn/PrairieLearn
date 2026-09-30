from typing import Any


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


def _cell(snapshot: dict[str, Any], sheet_name: str, address: str) -> dict[str, Any]:
    sheet = next(sheet for sheet in snapshot["sheets"] if sheet["name"] == sheet_name)
    return sheet["cells"][address]


def grade(data: dict[str, Any]) -> None:
    snapshot = data["submitted_answers"]["model"]
    correct = (
        _cell(snapshot, "Inputs", "B2")["input"] == {"type": "number", "value": 3}
        and _cell(snapshot, "Inputs", "C2")["input"] == {"type": "number", "value": 4}
        and _cell(snapshot, "Inputs", "D2")["input"]
        == {"type": "formula", "value": "=B2*C2"}
        and _cell(snapshot, "Inputs", "D2")["result"] == {"type": "number", "value": 12}
        and _cell(snapshot, "Summary", "B1")["result"]
        == {"type": "number", "value": 12}
    )
    data["score"] = 1 if correct else 0
