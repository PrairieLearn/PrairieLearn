import numpy as np
import numpy.linalg as la

# set up parameters
n = np.random.randint(4, 16)
A = np.eye(n)
b = np.random.random(n)

# hook into inverse functions
def not_allowed(*args, **kwargs):
    raise RuntimeError("Calling this function is not allowed")

la.inv = not_allowed
la.pinv = not_allowed
