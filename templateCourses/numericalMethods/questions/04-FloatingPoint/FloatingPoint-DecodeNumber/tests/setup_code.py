import numpy as np

nbits = 8
ntrials = np.random.randint(1, 15)
minifloats = []
for i in range(ntrials):
    minifloat = np.random.randint(2, size=nbits)
    minifloats.append(minifloat)
