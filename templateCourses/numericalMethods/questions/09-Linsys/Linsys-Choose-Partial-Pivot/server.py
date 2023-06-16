import numpy as np
import prairielearn as pl


def generate(data):
    n = np.random.randint(4, 7)
    A = np.random.randint(-9, 9, size=(n, n), dtype=np.int32)

    # Replace 1st column to ensure no duplicate mag
    pos = np.random.choice(np.arange(12, dtype=int), size=n, replace=False)
    signs = np.random.choice([-1, 1], size=n)
    col0 = pos * signs
    A[:, 0] = col0
    index = np.argmax(abs(A[:, 0]))

    data["params"]["A"] = pl.to_json(A)
    data["correct_answers"]["sol"] = int(A[index, 0])
    return data
