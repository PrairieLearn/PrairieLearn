import helper_function as hf
import numpy as np

G = np.array([[1, 0.5, 0, 0], [0, 0, 0.5, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 1]])

xstar2 = hf.power_iteration(G, np.array([0.0, 0.0, 1.0, 0.0]))
