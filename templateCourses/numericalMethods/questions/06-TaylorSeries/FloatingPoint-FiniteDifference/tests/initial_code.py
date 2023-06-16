import matplotlib.pyplot as plt


def func(x):
    """
    Parameters
    x: 1D numpy array
    Returns
    f: scalar function value
    """
    # WRITE YOUR CODE HERE


def dfunc(x):
    """
    Parameters
    x: 1D numpy array
    Returns
    df: 1D numpy array containing first derivatives wrt x
    """
    # WRITE YOUR CODE HERE


def fd(x, dx):
    """
    Parameters
    x: 1D numpy array
    dx: small perturbation (increment in x)  (scalar)
    Returns
    df: 1D numpy array containing approximations for the first derivatives wrt x
    """
    # WRITE YOUR CODE HERE


# COMPUTE FINITE DIFFERENCE APPROXIMATIONS FOR DECREASING VALUES OF dx
for dx in dxvec:
    # compute df_approx (using df function)
    # compute df_exact (using dfunc)
    # update variable error
    pass


plt.figure()
## Plot the error as a function of the perturbation dx
plt.show()
