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
