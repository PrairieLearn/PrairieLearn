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
    workbook = pl.Spreadsheet(data["submitted_answers"]["model"])
    inputs = workbook["Summary"]["Inputs!B2:D2"]
    assert isinstance(inputs, pl.SpreadsheetRange)
    line_total = inputs["D2"]

    checks = [
        inputs["B2"].value == 3,
        inputs["C2"].value == 4,
        line_total.formula == "=B2*C2",
        line_total.matches_formula("=B2*C2", structural=True),
        line_total.value == 12,
        workbook.outputs["line_total"].value == 12,
        workbook.outputs["line_total_is_correct"].value is True,
        workbook.outputs["example_error"].is_error,
    ]
    score = sum(checks) / len(checks)
    data["partial_scores"]["model"] = {"score": score, "weight": 1}
    pl.set_weighted_score_data(data)
    data["feedback"]["model"] = (
        "The inputs, formula structure, and private grading outputs are correct."
        if score == 1
        else "Check the inputs, formula, and calculated line total."
    )
