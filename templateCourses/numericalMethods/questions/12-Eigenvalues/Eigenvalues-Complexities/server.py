import numpy as np
import prairielearn as pl


def generate(data):
    V = np.random.randint(3)
    k1 = 100
    k2 = 200
    n1 = int(np.random.choice([4000, 5000, 6000]))
    n2 = 3 * n1
    t1 = int(np.random.choice([1, 2]))

    if V == 0:
        eigen_type = "largest"
        iter_type = "normalized Power Iteration"
        LU_info = ".  "
        complexity = "Ckn^p"
        t2 = (k2 / k1) * ((n2 / n1) ** 2) * t1
        f1 = (k2 / k1) * (n2 / n1) * t1
        f2 = ((k2 / k1) ** 2) * ((n2 / n1) ** 2) * t1
        f3 = ((n2 / n1) ** 3) * t1

    if V == 1:
        eigen_type = "smallest"
        iter_type = "normalized Inverse Iteration"
        LU_info = ".  You implement an efficient version where you do not repeat computations unnecessarily.  "
        complexity = "Cn^p"
        t2 = ((n2 / n1) ** 3) * t1
        f1 = (k2 / k1) * ((n2 / n1) ** 2) * t1
        f2 = ((k2 / k1) ** 3) * ((n2 / n1) ** 3) * t1
        f3 = ((n2 / n1) ** 2) * t1

    if V == 2:
        eigen_type = "smallest"
        iter_type = "normalized Inverse Iteration"
        LU_info = ".  You are GIVEN the LU factorization of both matrices - so you are able to efficiently solve systems involving both matrices.  "
        complexity = "Ckn^p"
        t2 = (k2 / k1) * ((n2 / n1) ** 2) * t1
        f1 = (k2 / k1) * (n2 / n1) * t1
        f2 = ((k2 / k1) ** 2) * ((n2 / n1) ** 2) * t1
        f3 = ((n2 / n1) ** 3) * t1

    if t1 == 1:
        sec = "second"
    else:
        sec = "seconds"

    data["params"]["eigen_type"] = eigen_type
    data["params"]["iter_type"] = iter_type
    data["params"]["complexity"] = complexity
    data["params"]["false0"] = pl.to_json(f1)
    data["params"]["false1"] = pl.to_json(f2)
    data["params"]["false2"] = pl.to_json(f3)
    data["params"]["true"] = pl.to_json(t2)
    data["params"]["k1"] = pl.to_json(k1)
    data["params"]["k2"] = pl.to_json(k2)
    data["params"]["n1"] = pl.to_json(n1)
    data["params"]["n2"] = pl.to_json(n2)
    data["params"]["t1"] = pl.to_json(t1)
    data["params"]["LU_info"] = LU_info
    data["params"]["sec"] = sec

    return data
