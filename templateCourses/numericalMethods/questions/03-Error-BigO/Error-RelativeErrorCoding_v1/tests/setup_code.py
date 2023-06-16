import numpy as np

noise = np.random.rand()
x = np.random.rand() * (100 - 1)


def f_hat(x):
    return x**0.72 - noise
