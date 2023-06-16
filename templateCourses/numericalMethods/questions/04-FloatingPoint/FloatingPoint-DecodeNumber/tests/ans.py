import numpy as np

p = 3
outputs = []


def arr2binstring(x):
    my_str = "0b"
    for entry in x:
        my_str += str(entry)
    return my_str


for minifloat in minifloats:
    s = minifloat[0]
    E = int(arr2binstring(minifloat[1:5]), 2) - 8
    M = minifloat[-3:].copy()
    M = np.insert(M, 0, 1)
    M = int(arr2binstring(M), 2)
    fp = (-1.0) ** s * M * 2 ** (E - p)
    outputs.append(fp)
