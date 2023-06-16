import numpy as np

xvec = np.random.randint(2, 10) / 10.0
xvec = np.array([np.random.randint(1, 100) / 10.0, np.random.randint(1, 100) / 10.0])

dx = 1
dxvec = []
for i in range(35):
    dxvec += [dx]
    dx = dx / 2
dxvec = np.array(dxvec)
