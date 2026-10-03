import prairielearn as pl
import prairielearn.spreadsheet_utils as psp

VOLATILE: psp.VolatileSpec = {
    "Orders!A2:A3": (10, 99),
    "Orders!B2:B3": (0.05, 0.09, 0.0025),
}


def generate(data: pl.QuestionData) -> None:
    data["params"]["workbook"] = psp.create_spreadsheet(
        {
            "Orders": {
                "cells": {"A1": "Subtotal", "B1": "Rate", "C1": "Tax"},
                "editable_ranges": ["C2:C3"],
            }
        },
        volatile=VOLATILE,
    )
    data["correct_answers"]["model"] = psp.create_spreadsheet(
        reference=psp.fill_formula("Orders!C2:C3", "=A2*B2"),
        test_cases=[{"name": "zero subtotal", "inputs": {"Orders!A2": 0}}],
        volatile=VOLATILE,
        volatile_cases=4,
        rtol=0,
        atol=1e-9,
    )
