# Anything in this file will be run before the student's code
# Use it to generate anything needed for the solution

import numpy as np

beta = data["params"]["beta"]

n = int(np.random.choice([4, 5]))
m = int(n - np.random.choice([1, 2]))
a = np.random.random((n, m))
