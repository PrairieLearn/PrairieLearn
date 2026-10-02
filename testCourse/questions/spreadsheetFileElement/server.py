import json
from typing import Any

import prairielearn.spreadsheet_utils as psp


def generate(data: dict[str, Any]) -> None:
    data["correct_answers"]["model"] = {
        "test_cases": [{"name": "ten", "inputs": {"Inputs!B2": 10}}],
    }


def grade(data: dict[str, Any]) -> None:
    workbook = psp.Book(
        data["submitted_answers"]["model"], grading=data["correct_answers"]["model"]
    )
    is_correct = workbook.outputs["is_correct"].value is True
    data["score"] = (int(is_correct) + workbook.reference.score()) / 2


def test(data: dict[str, Any]) -> None:
    # pl-spreadsheet only submits the reference cell, but grade() also requires
    # the parameter cell to make the visible check formula true.
    if data["test_type"] == "correct":
        submission = json.loads(data["raw_submitted_answers"]["model"])
        submission["sheets"]["Inputs"]["A1"] = 3
        data["raw_submitted_answers"]["model"] = json.dumps(submission)
        data["score"] = 1
