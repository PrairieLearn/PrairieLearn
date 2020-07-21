import numpy as np

def make_array_b(a):
    b = np.copy(a)
    for i in range(1, len(a)):
        b[i] += a[i-1]
    return b
    