import matplotlib.pyplot as plt
import numpy as np

brackets = []
gs = (np.sqrt(5) - 1) / 2
m1 = a + (1 - gs) * (b - a)
m2 = a + gs * (b - a)

# Begin your modifications below here

while False:
    brackets.append([a, m1, m2, b])

# End your modifications above here

# Plotting code below, no need to modify
x = np.linspace(-10, 10)
plt.plot(x, f(x))

brackets = np.array(brackets)
names = ["a", "m1", "m2", "b"]
for i in range(4):
    plt.plot(brackets[:, i], 3 * np.arange(len(brackets)), "o-", label=names[i])
plt.legend()
