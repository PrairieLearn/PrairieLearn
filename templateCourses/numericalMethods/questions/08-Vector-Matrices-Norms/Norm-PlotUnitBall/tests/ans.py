import matplotlib.pyplot as plt
import numpy as np


def norm(x, p):
    """Computes a p-norm.

    Args:
        x (ndarray): input array
        p (int or float): order of the norm

    Returns:
        (float): the p-norm of the array
    """
    return np.sum(np.abs(x) ** p, axis=0) ** (1 / p)


ps = [1, 2, 5, 0.5]
phi = np.linspace(0, 2 * np.pi, 500)
unit_circle = np.array([np.cos(phi), np.sin(phi)])

figs = []
for i in range(4):
    p = ps[i]
    # Create a new figure
    plt.figure()
    unit_norm_ball = unit_circle / norm(unit_circle, p)
    norm_ball = unit_norm_ball * r
    plt.plot(norm_ball[0], norm_ball[1])

    # Use equal x and y axes
    plt.gca().set_aspect("equal")

    # Add a legend
    plt.legend()

    plt.title("{}-norm".format(p))
    plt.xlabel("x")
    plt.ylabel("y")

    figs.append(plt.gca())

fig_1, fig_2, fig_3, fig_4 = figs
