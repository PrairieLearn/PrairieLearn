import numpy as np

r = np.random.uniform(2.0, 5.0)


def not_allowed(*args, **kwargs):
    raise RuntimeError("np.linalg.norm() is not allowed")


saved_norm = np.linalg.norm
np.linalg.norm = not_allowed
