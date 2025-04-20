import numpy as np
import prairielearn as pl


def generate(data):
    # Dimensions
    n = np.random.randint(3, 5)
    m = np.random.randint(2, 4)

    A = np.round(np.random.rand(m, n), 2)
    b = np.round(np.random.rand(n), 2)

    # Product of these two matrices
    C = A @ b

    # # Modify data and return
    data["params"]["A"] = pl.to_json(A)
    data["params"]["b"] = pl.to_json(b.reshape(n, 1))
    data["correct_answers"]["C"] = pl.to_json(C.reshape(m, 1))
