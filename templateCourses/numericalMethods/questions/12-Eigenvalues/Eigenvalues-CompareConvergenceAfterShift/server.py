import numpy as np


def generate(data):

    lm_1, lm_2, lm_3 = np.flip(
        np.sort(np.random.choice(np.arange(1, 11), size=3, replace=False))
    ) * np.random.choice([-1, 1], 3)
    sig = lm_3 / 2
    L = np.array([lm_1, lm_2, lm_3])
    ind = np.argmin(np.abs(L[:2] - sig))

    u3 = np.array([1, 0, 1]) * np.random.choice([-1, 1], 3)
    x_0 = np.array([1, 1, 1]) * np.random.choice([-1, 1], 3)

    k = np.random.choice(np.arange(3, 6))

    ratio = np.abs(lm_3 / lm_2)

    shifted_ratio = np.abs((lm_3 - sig) / (L[ind] - sig))

    e_0 = np.linalg.norm(x_0 - u3, np.inf)

    sol_1 = e_0 * ratio**k
    sol_2 = e_0 * shifted_ratio**k

    data["params"]["lm_1"], data["params"]["lm_2"], data["params"]["lm_3"] = (
        int(lm_1),
        int(lm_2),
        int(lm_3),
    )
    data["params"]["u1"], data["params"]["u2"], data["params"]["u3"] = (
        int(u3[0]),
        int(u3[1]),
        int(u3[2]),
    )
    data["params"]["x1"], data["params"]["x2"], data["params"]["x3"] = (
        int(x_0[0]),
        int(x_0[1]),
        int(x_0[2]),
    )
    data["params"]["shift"] = float(sig)
    data["params"]["iters"] = int(k)
    data["correct_answers"]["sol_1"] = float(sol_1)
    data["correct_answers"]["sol_2"] = float(sol_2)

    return data
