from typing import Any

import prairielearn.spreadsheet_utils as psp


def grade(data: dict[str, Any]) -> None:
    workbook = psp.Book(data["submitted_answers"]["model"])
    data["score"] = int(workbook.outputs["is_correct"].value is True)
