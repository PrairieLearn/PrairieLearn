import numpy as np


# It may be helpful to complete this function
def norm(x, p):
    """Computes a p-norm.

    Args:
        x (ndarray): input array
        p (int or float): order of the norm

    Returns:
        (float): the p-norm of the array
    """


ps = [1, 2, 5, 0.5]
phi = np.linspace(0, 2 * np.pi, 500)
unit_circle = np.array([np.cos(phi), np.sin(phi)])
