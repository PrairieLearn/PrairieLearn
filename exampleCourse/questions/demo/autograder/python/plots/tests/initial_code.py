import matplotlib.pyplot as plt
import numpy as np

x = np.arange(0, 11)
fx = np.exp(x)

plt.semilogy(x, fx)
plot = plt.gca()
