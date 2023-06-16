import numpy as np
import prairielearn as pl
import sympy as sym


def generate(data):

    x, y, z = sym.symbols("x y z")
    # "basis"
    r1 = np.random.randint(2, 4)
    r2 = np.random.randint(2, 4)
    r3 = np.random.randint(2, 4)
    fxns = [
        x**i * y**j * z**k
        for i in range(r1)
        for j in range(r2)
        for k in range(r3)
    ]
    # pick out a few terms
    pick = [np.random.randint(0, len(fxns)) for i in range(3)]
    f = 0
    for i in pick:
        f += fxns[i]

    coord = np.array([1.0, 1.0, 1.0])
    h = 0.1
    gradf = np.zeros((3,))
    approx_deriv = ["forward", "backward", "central"][np.random.randint(0, 3)]

    for i, t in enumerate([x, y, z]):
        xfd = coord.copy()
        fval = f.subs([(x, coord[0]), (y, coord[1]), (z, coord[2])])
        if approx_deriv == "forward":
            xfd[i] += h
            f_fd = f.subs([(x, xfd[0]), (y, xfd[1]), (z, xfd[2])])
            gradf[i] = (f_fd - fval) / h
        elif approx_deriv == "backward":
            xfd[i] -= h
            f_fd = f.subs([(x, xfd[0]), (y, xfd[1]), (z, xfd[2])])
            gradf[i] = (fval - f_fd) / h
        else:
            xfd[i] += h
            f_fd1 = f.subs([(x, xfd[0]), (y, xfd[1]), (z, xfd[2])])
            xfd[:] = coord.copy()
            xfd[i] -= h
            f_fd2 = f.subs([(x, xfd[0]), (y, xfd[1]), (z, xfd[2])])
            gradf[i] = (f_fd1 - f_fd2) / (2 * h)

    n = gradf.shape[0]
    data["correct_answers"]["vec"] = pl.to_json(gradf.reshape((n, 1)))
    # data["params"]["vec"] = pl.to_json(gradf.reshape((n,1)))
    data["params"]["coord"] = pl.to_json(coord.reshape((1, n)))
    data["params"]["fxn"] = sym.latex(f)
    data["params"]["approx_type"] = approx_deriv
    data["params"]["h"] = h
    return data
