import matplotlib.pyplot as plt
import numpy as np
import scipy.linalg as la

eigenval1 = np.zeros(n)
eigenvec1 = np.zeros((n, 2))
eigenval2 = np.zeros(n)
eigenvec2 = np.zeros((n, 2))
shifted_eigval = np.zeros(n)
shifted_eigvec = np.zeros((n, 2))
cnt = np.zeros(n)


def normalized_shifted_inverse_power_iteration(A, guess, shift):
    x = guess.copy()
    B = A - shift * np.eye(A.shape[0])
    P, L, U = la.lu(B)

    for k in range(500):
        y = np.dot(P.T, x)
        y = la.solve_triangular(L, y, lower=True)
        y = la.solve_triangular(U, y, lower=False)
        x = y / la.norm(y)

    eigenvector = x
    eigenvalue = x.dot(A.dot(x)) / (x.dot(x))
    return eigenvalue, eigenvector


for i in range(n):
    # x = np.ones(2,)
    # x *= 0.5**0.5
    x = x_0
    while True:
        x_pre = x
        x = As[i].dot(x)
        x /= la.norm(x)
        cnt[i] += 1
        if la.norm(x - x_pre) < 1e-12:
            eigenvec1[i] = x
            break
    eigenval1[i] = np.dot(np.dot(x, As[i]), x) / (x.dot(x))

    # x = np.ones(2,)
    # x *= 0.5**0.5
    x = x_0
    P, L, U = la.lu(As[i])
    while True:
        x_pre = x

        y = np.dot(P.T, x)
        y = la.solve_triangular(L, y, lower=True)
        y = la.solve_triangular(U, y, lower=False)
        x = y / la.norm(y)
        if la.norm(x - x_pre) < 1e-12:
            eigenvec2[i] = x
            break
    eigenval2[i] = np.dot(np.dot(x, As[i]), x) / (x.dot(x))

    shift_eigval, shift_eigvec = normalized_shifted_inverse_power_iteration(
        As[i], x_0, 1
    )
    shifted_eigval[i] = shift_eigval
    shifted_eigvec[i] = shift_eigvec


ratios = eigenval2 / eigenval1
plt.plot(ratios, cnt, "ro")
plt.xlabel("ratio")
plt.ylabel("cnt")
plt.title("convergence")
