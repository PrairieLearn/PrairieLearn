import numpy as np


def func(x):
    x1 = x[0]
    x2 = x[1]
    f = 2 * x1**2 - 0.5 * x1 * x2 + 5 * x2**3
    return f


def dfunc(x):
    x1 = x[0]
    x2 = x[1]
    df1 = 4 * x1 - 0.5 * x2
    df2 = -0.5 * x1 + 15 * x2**2
    return np.array([df1, df2])


def fd(xvec, dx):
    f = func(xvec)
    df = np.zeros(len(xvec))
    xtemp = np.copy(xvec)
    for i in range(len(xvec)):
        xtemp[i] = xtemp[i] + dx
        df[i] = (func(xtemp) - f) / dx
        xtemp[i] = xtemp[i] - dx
    return df


error_list = []
for dx in dxvec:
    df_approx = fd(xvec, dx)
    df_exact = dfunc(xvec)
    ea = max(abs(df_approx - df_exact))
    error_list.append(ea)
error = np.array(error_list)

"""
plt.figure()
plt.loglog(dxvec,error,'o-')
plt.grid()
plt.xlabel('perturbation size')
plt.ylabel('error')
plt.title('Finite difference error')
plt.show()
"""
