import numpy as np

def power_iteration(M, x):
    xc = x.copy()
    for _ in range(100):
        xc = M @ xc
    return xc
