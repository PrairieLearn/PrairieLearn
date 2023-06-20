import numpy as np


def generate(data):
    # Pass the rtol value to {{params.rtol}}.
    rtol = 0.01
    data["params"]["rtol"] = str(rtol)

    # Compute the solution
    e0 = 8.85e-12
    k = 1 / (4 * np.pi * e0)
    q = 1.6e-19  # C
    d = 1e-15  # m
    F = k * q**2 / d**2  # N

    # Put the solution into data['correct_answers']
    data["correct_answers"]["F"] = F
