import numpy as np

# Save the seed for later so we can reproduce the same results
seed = np.random.randint(1000)
np.random.seed(seed)

size = 10**7


import numpy as np

# There are actually 2 possible orders in which to produce random numbers,
# resulting in slightly different answers. Test both.

# Take 1
np.random.seed(seed)
xs = np.random.random(size)
ys = np.random.random(size)
