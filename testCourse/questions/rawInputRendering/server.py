import numpy as np
import prairielearn as pl


def generate(data: pl.QuestionData) -> None:
    data["correct_answers"]["matrix_value"] = pl.to_json(np.array([[1, 2]]))
