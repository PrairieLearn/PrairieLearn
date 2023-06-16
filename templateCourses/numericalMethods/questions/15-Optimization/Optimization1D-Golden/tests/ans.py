import matplotlib.pyplot as plt
import numpy as np

brackets = []
gs = (np.sqrt(5) - 1) / 2
m1 = a + (1 - gs) * (b - a)
m2 = a + gs * (b - a)

fm1 = f(m1)
fm2 = f(m2)
while b - a > 1e-5:
    brackets.append([a, m1, m2, b])

    if fm1 <= fm2:
        b = m2
        m2 = m1
        fm2 = fm1
        m1 = a + (1 - gs) * (b - a)
        fm1 = f(m1)
    else:
        a = m1
        m1 = m2
        fm1 = fm2
        m2 = a + gs * (b - a)
        fm2 = f(m2)

# Plotting code below, no need to modify
x = np.linspace(-10, 10)
plt.plot(x, f(x))

brackets = np.array(brackets)
names = ["a", "m1", "m2", "b"]
for i in range(4):
    plt.plot(brackets[:, i], 3 * np.arange(len(brackets)), "o-", label=names[i])
plt.legend()
