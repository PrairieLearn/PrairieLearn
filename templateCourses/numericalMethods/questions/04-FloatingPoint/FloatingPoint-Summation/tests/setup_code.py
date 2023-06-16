import random

import numpy as np

lb = 300000
ub = 400000
L = random.randint(lb, ub)

# create a random array with large magnitude variation
data = np.exp(np.random.uniform(-125, 10, L))

# randomly make some of the entries negative
data = data * np.random.choice([-1.0, 1.0], size=(L,))

# shuffle the order
random.shuffle(data)


def not_allowed(*args, **kwargs):
    raise RuntimeError("Calling this function is not allowed")


np.sum = not_allowed
np.cumsum = not_allowed
