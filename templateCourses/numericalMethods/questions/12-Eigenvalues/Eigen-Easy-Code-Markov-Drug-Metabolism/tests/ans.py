import numpy as np

M = np.array(data["params"]["m"]["_value"])
perc = int(data["params"]["perc"]) * 1.0 / 100

v = np.zeros((4,))
v[0] = 1.0

hours = 0

while v[3] < perc:
    v = M @ v
    hours += 1
