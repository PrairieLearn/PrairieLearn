import numpy as np
from plot_serializer.matplotlib.serializer import MatplotlibSerializer

x = np.arange(0, 11)
fx = np.exp(x)

plot = MatplotlibSerializer()
fig, ax = plot.subplots()
ax.plot(x, fx)
ax.set_yscale("log")
