import numpy as np
import prairielearn as pl


def generate(data: pl.QuestionData):
    data["params"]["beta"] = np.random.randint(2, 6)
