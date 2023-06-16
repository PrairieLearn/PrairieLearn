import random

import numpy as np

## Part 1


def insideCylinders(pos, r):
    return (pos[0] ** 2 + pos[1] ** 2 <= r**2) and (
        pos[1] ** 2 + pos[2] ** 2 <= r**2
    )


## Part 2


def prob_inside_volume(N, r):
    C = 0.0
    for i in range(N):
        x = random.uniform(-r, r)
        y = random.uniform(-r, r)
        z = random.uniform(-r, r)
        pos = np.array([x, y, z])
        if insideCylinders(pos, r):
            C += 1
    return C / N
