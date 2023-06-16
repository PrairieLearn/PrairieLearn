import numpy as np


def generate(data):
    if np.random.randint(0, 2) == 0:
        data["params"]["tag1"] = "true"
        data["params"][
            "des1"
        ] = "Golden section search requires one function evaluation per iteration after the first iteration."
    else:
        data["params"]["tag1"] = "false"
        data["params"][
            "des1"
        ] = "Golden section search requires two function evaluations per iteration."

    if np.random.randint(0, 2) == 0:
        data["params"]["tag2"] = "false"
        data["params"][
            "des2"
        ] = "In order to perform golden section search, we need to know the derivative and second derivative of function $f(x)$."
    else:
        data["params"]["tag2"] = "true"
        data["params"][
            "des2"
        ] = "We do not need to compute the derivative of $f(x)$ in golden section search."

    if np.random.randint(0, 2) == 0:
        data["params"]["tag3"] = "false"
        data["params"][
            "des3"
        ] = "Golden section search can achieve superlinear convergence."
    else:
        data["params"]["tag3"] = "true"
        data["params"][
            "des3"
        ] = "Golden section search requires $f(x)$ to be unimodal on the interval $[a,b]$."

    data["params"]["tag4"] = "true"
    data["params"][
        "des4"
    ] = "Compared with Newton's method of optimization, golden section search is cheaper but slower."
    return data
