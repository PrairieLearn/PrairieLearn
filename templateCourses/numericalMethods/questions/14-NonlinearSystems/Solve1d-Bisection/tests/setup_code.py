import numpy as np


# Test Functions
def function(x):
    return 2 * x**2 - 3 * x - 2


# Test intervals
intervals = [(-2, -0), (0, 3), (-5, -3), (2, 0)]
# randomly generate intervals
for i in range(6):
    intervals.append((np.random.randint(-10, 1), np.random.randint(-1, 10)))

# Algorithm variables
epsilon = 1e-6
n_iter = 100
