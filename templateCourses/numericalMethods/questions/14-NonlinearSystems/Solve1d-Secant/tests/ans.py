import numpy as np

x1, x2 = xks
roots = []

for i in range(5):
    fx1, fx2 = f(x1), f(x2)
    roots.append((x1 * fx2 - x2 * fx1) / (fx2 - fx1))
    x1, x2 = x2, roots[-1]

roots = np.array(roots)
