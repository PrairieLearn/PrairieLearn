import numpy as np
import prairielearn as pl


def generate(data):
    data["correct_answers"]["total"] = pl.to_json(np.array([[22, 9], [17, 13]]))
