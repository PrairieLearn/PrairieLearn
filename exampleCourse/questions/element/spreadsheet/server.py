import json

import prairielearn as pl
import prairielearn.spreadsheet_utils as psp


def generate(data):
    data["params"]["workbook"] = psp.create_spreadsheet({
        "Inputs": {
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
        "Summary": {
            "rows": 4,
            "columns": 2,
            "cells": {
                "A1": "Budget total",
                "B1": "=SUM(Inputs!D2:D6)",
            },
        },
    })
    data["correct_answers"]["model"] = psp.create_spreadsheet(
        {
            "Checks": {
                "A1": "=Inputs!D2",
                "A2": "=A1=12",
                "A3": "=1/0",
            }
        },
        outputs={
            "line_total": "Checks!A1",
            "line_total_is_correct": {"cell": "Checks!A2"},
            "example_error": "Checks!A3",
        },
    )

    data["params"]["order"] = psp.create_spreadsheet({
        "Order": {
            "cells": {
                "A1": "Item",
                "B1": "Quantity",
                "C1": "Unit price",
                "D1": "Line total",
                "A2": "Pens",
                "B2": 12,
                "C2": 1.5,
                "A3": "Paper",
                "B3": 3,
                "C3": 6.25,
                "A4": "Folders",
                "B4": 5,
                "C4": 2,
                "A5": "Total",
                "D5": "=SUM(D2:D4)",
            },
            "editable_ranges": ["D2:D4"],
        }
    })
    # Test cases override the locked quantities and prices. random_cases() uses the
    # per-variant seed, so every student in a variant sees the same hidden cases.
    data["correct_answers"]["order"] = psp.create_spreadsheet(
        {"Checks": {"A1": "=Order!D5"}},
        outputs={"order_total": "Checks!A1"},
        test_cases=[
            {"name": "no pens", "inputs": {"Order!B2": 0}},
            *psp.random_cases(
                5,
                {
                    "Order!B2": (1, 50),
                    "Order!C3": (0.5, 20.0),
                    "Order!B4": [0, 10, 100],
                },
            ),
        ],
        reference=psp.fill_formula("Order!D2:D4", "=B2*C2"),
        compare_outputs=True,
    )


def grade(data):
    # External graders read this same object from
    # data["submitted_answers"]["model"] in /grade/data/data.json.
    workbook = psp.Book(data["submitted_answers"]["model"])
    inputs = workbook["Summary"].range("Inputs!B2:D2")
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
    data["partial_scores"]["model"] = {
        "score": score,
        "weight": 1,
        "feedback": (
            "The inputs, formula structure, and private grading outputs are correct."
            if score == 1
            else "Check the inputs, formula, and calculated line total."
        ),
    }
    inventory = psp.Book(data["submitted_answers"]["inventory"])
    data["partial_scores"]["inventory"] = {
        "score": int(inventory.outputs["is_correct"].value is True),
        "weight": 1,
    }
    labor = psp.Book(data["submitted_answers"]["labor"])
    data["partial_scores"]["labor"] = {
        "score": int(labor.outputs["is_correct"].value is True),
        "weight": 1,
    }
    # pl-spreadsheet grades "order" against its reference solution on its own.
    pl.set_weighted_score_data(data)


def test(data):
    if data["test_type"] == "invalid":
        return
    # pl-spreadsheet submits the reference solution for "order" and the starting
    # values elsewhere. The CSV and TSV workbooks start correct, and the starting
    # "model" workbook passes only its formula and error-output checks.
    if data["test_type"] == "correct":
        submission = json.loads(data["raw_submitted_answers"]["model"])
        submission["sheets"]["Inputs"].update({"B2": 3, "C2": 4})
        data["raw_submitted_answers"]["model"] = json.dumps(submission)
        data["partial_scores"]["model"] = {
            "score": 1,
            "weight": 1,
            "feedback": "The inputs, formula structure, and private grading outputs are correct.",
        }
    else:
        data["partial_scores"]["model"] = {
            "score": 3 / 8,
            "weight": 1,
            "feedback": "Check the inputs, formula, and calculated line total.",
        }
    for name in ["inventory", "labor"]:
        data["partial_scores"][name] = {"score": 1, "weight": 1}
    pl.set_weighted_score_data(data)
