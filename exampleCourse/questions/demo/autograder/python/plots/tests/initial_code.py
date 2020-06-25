import numpy as np
import matplotlib.pyplot as plt

x = np.arange(0, 11)
fx = np.exp(x)

plt.semilogy(x, fx)
plot = plt.gca()
