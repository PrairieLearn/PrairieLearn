import prairielearn as pl


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
    data["correct_answers"]["model"] = {
        "schema_version": 1,
        "sheets": [
            {
                "name": "Checks",
                "rows": 3,
                "columns": 1,
                "cells": {
                    "A1": "=Inputs!D2",
                    "A2": "=A1=12",
                    "A3": "=1/0",
                },
            }
        ],
        "outputs": {
            "line_total": {"sheet": "Checks", "cell": "A1"},
            "line_total_is_correct": {"sheet": "Checks", "cell": "A2"},
            "example_error": {"sheet": "Checks", "cell": "A3"},
        },
    }


def grade(data):
    # External graders read this same object from
    # data["submitted_answers"]["model"] in /grade/data/data.json.
    snapshot = data["submitted_answers"]["model"]
    formula = pl.get_spreadsheet_formula(snapshot, "Inputs", "D2")
    formula_ast = pl.get_spreadsheet_formula_ast(snapshot, "Inputs", "D2")
    expected_ast = pl.parse_spreadsheet_formula("=B2*C2")
    grading_error = pl.get_spreadsheet_grading_output(snapshot, "example_error")

    checks = [
        pl.get_spreadsheet_value(snapshot, "Inputs", "B2") == 3,
        pl.get_spreadsheet_value(snapshot, "Inputs", "C2") == 4,
        formula == "=B2*C2",
        formula_ast is not None and formula_ast["root"] == expected_ast["root"],
        pl.get_spreadsheet_value(snapshot, "Inputs", "D2") == 12,
        pl.get_spreadsheet_grading_output(snapshot, "line_total")
        == {"type": "number", "value": 12},
        pl.get_spreadsheet_grading_output(snapshot, "line_total_is_correct")
        == {"type": "boolean", "value": True},
        grading_error.get("type") == "error",
    ]
    score = sum(checks) / len(checks)
    data["partial_scores"]["model"] = {"score": score, "weight": 1}
    pl.set_weighted_score_data(data)
    data["feedback"]["model"] = (
        "The inputs, formula structure, and private grading outputs are correct."
        if score == 1
        else "Check the inputs, formula, and calculated line total."
    )
