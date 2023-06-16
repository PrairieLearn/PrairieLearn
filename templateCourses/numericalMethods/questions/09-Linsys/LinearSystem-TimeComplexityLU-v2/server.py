import random

import numpy as np


def generate(data):
    k_factorize = 3
    k_triangular = 2

    scale = random.randint(3, 5)
    n0 = random.choice([400, 450, 500])
    m_factorize = random.randint(5, 7)
    t_factorize = scale**m_factorize
    m_triangular = random.randint(2, 4)
    t_triangular = scale**m_triangular
    b = random.choice(np.linspace(10, 50, 5))

    data["params"]["n0"] = n0 * scale
    data["params"]["n1"] = n0
    data["params"]["t0"] = t_factorize
    data["params"]["t1"] = t_triangular
    data["params"]["b"] = b

    data["correct_answers"]["t2"] = (t_factorize * scale**-k_factorize) + (
        b * t_triangular * scale**-k_triangular
    )

    return data
