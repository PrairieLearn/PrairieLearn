from typing import Any

import prairielearn as pl


def grade(data: dict[str, Any]) -> None:
    workbook = pl.SpreadsheetBook(data["submitted_answers"]["model"])
    data["score"] = int(workbook.outputs["is_correct"].value is True)
