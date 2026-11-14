import random

import numpy as np

# The grader doesn't seed student code, so pick a seed here and let the test
# reuse it to compute the expected answer.
seed = random.randrange(2**32)
np.random.seed(seed)

random.random = np.random.random_sample
random.uniform = np.random.uniform
