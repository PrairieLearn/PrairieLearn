import numpy as np
import prairielearn as pl


def generate(data):

    x1_init = np.random.randint(3, 10)
    x2_init = np.random.randint(2, 8)
    data["params"]["x1_init"] = x1_init
    data["params"]["x2_init"] = x2_init

    data["params"]["a"] = np.random.randint(1, 10) * 0.5
    data["params"]["b"] = np.random.randint(2, 3)
    data["params"]["c"] = np.random.randint(5, 15) * 0.5

    s0 = np.array([[-x1_init, -x2_init]])
    data["correct_answers"]["s0"] = pl.to_json(s0)

    return data
