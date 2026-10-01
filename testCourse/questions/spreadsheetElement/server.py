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
    snapshot = data["submitted_answers"]["model"]
    formula_ast = pl.get_spreadsheet_formula_ast(snapshot, "Inputs", "D2")
    line_total = pl.get_spreadsheet_grading_output(snapshot, "line_total")
    total_is_correct = pl.get_spreadsheet_grading_output(snapshot, "total_is_correct")
    correct = (
        pl.get_spreadsheet_value(snapshot, "Inputs", "B2") == 3
        and pl.get_spreadsheet_value(snapshot, "Inputs", "C2") == 4
        and pl.get_spreadsheet_formula(snapshot, "Inputs", "D2") == "=B2*C2"
        and formula_ast is not None
        and formula_ast["root"]["type"] == "binary"
        and formula_ast["root"]["operator"] == "*"
        and line_total == {"type": "number", "value": 12}
        and total_is_correct == {"type": "boolean", "value": True}
    )
    data["score"] = 1 if correct else 0
