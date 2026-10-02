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
        reference={f"Order!D{row}": f"=B{row}*C{row}" for row in range(2, 5)},
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
    data["partial_scores"]["model"] = {"score": score, "weight": 1}
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
    order = psp.Book(
        data["submitted_answers"]["order"], grading=data["correct_answers"]["order"]
    )
    data["partial_scores"]["order"] = {
        "score": order.reference.score(),
        "weight": 1,
    }
    for address, series in order.reference.items():
        mismatch = series.first_mismatch
        if mismatch is None:
            continue
        when = (
            "with the values shown"
            if mismatch.case is None
            else f"in a hidden case with inputs {dict(mismatch.case.inputs or {})}"
        )
        data["feedback"]["order"] = (
            f"{address} is {mismatch.student_value} {when}; expected "
            f"{mismatch.reference_value}. Use a formula rather than a typed value."
        )
        break
    pl.set_weighted_score_data(data)
    data["feedback"]["model"] = (
        "The inputs, formula structure, and private grading outputs are correct."
        if score == 1
        else "Check the inputs, formula, and calculated line total."
    )
