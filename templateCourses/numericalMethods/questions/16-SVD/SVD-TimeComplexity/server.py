import numpy as np
import prairielearn as pl


def generate(data):
    # Randomization
    scale = int(np.random.choice([3, 4, 5]))
    variant_index = int(np.random.randint(4))
    n1_list = [2000, 3000, 4000, 5000]
    t1_list = [2, 4, 6, 8]

    # Initialize given values
    n1 = n1_list[variant_index]
    n2 = scale * n1
    t1 = t1_list[variant_index]

    # SVD is O(n^3)
    t2 = ((scale) ** 3) * t1
    f1 = ((scale) ** 2) * t1
    f2 = (scale) * t1
    f3 = t1**3

    # In case there are any duplicate answers
    while f1 == t2:
        f1 = f1 * scale
    while f2 == t2 or f2 == f1:
        f2 = f2 * scale
    while f3 == t2 or f3 == f1 or f3 == f2:
        f3 = f3 * t1

    if t1 == 1:
        sec = "second"
    else:
        sec = "seconds"

    data["params"]["n1"] = pl.to_json(n1)
    data["params"]["n2"] = pl.to_json(n2)
    data["params"]["t1"] = pl.to_json(t1)
    data["params"]["sec"] = sec
    data["params"]["true"] = pl.to_json(t2)
    data["params"]["false1"] = pl.to_json(f1)
    data["params"]["false2"] = pl.to_json(f2)
    data["params"]["false3"] = pl.to_json(f3)

    return data
