import numpy as np
import numpy.linalg as la
import scipy.optimize as opt


def f(x):
    return 3 + x[0] ** 2 / 8 + x[1] ** 2 / 8 - np.sin(x[0]) * np.cos(2**-0.5 * x[1])


def obj_func(alpha, x, s):
    f_of_x_plus_alpha_s = f(x + alpha * s)
    return f_of_x_plus_alpha_s


def gradient(r):
    x, y = r
    g1 = 0.25 * x - np.cos(x) * np.cos((np.sqrt(2) / 2) * y)
    g2 = 0.25 * y + np.sin(x) * (np.sqrt(2) / 2) * np.sin((np.sqrt(2) / 2) * y)
    return np.array([g1, g2])


def steepest_descent(x_init, stop):
    x_values = [x_init]
    x_new = x_init.copy()
    x_prev = x_init + stop + 30
    iteration_count = 0
    while la.norm(gradient(x_new)) >= stop:
        x_prev = x_new
        s = -1 * gradient(x_prev)
        alpha = opt.minimize_scalar(obj_func, args=(x_prev, s)).x
        x_new = x_prev + alpha * s
        x_values.append(x_new)
        iteration_count += 1
    x_values = np.array(x_values)
    return x_new, iteration_count, x_values


def hessian(r):
    # Computes the hessian matrix corresponding to the given objective function
    x, y = r
    h1 = 0.25 + np.sin(x) * np.cos((np.sqrt(2) / 2) * y)
    h2 = 0.25 + np.sin(x) * np.cos((np.sqrt(2) / 2) * y) * (np.sqrt(2) / 2) * (
        np.sqrt(2) / 2
    )

    h12 = np.sin((np.sqrt(2) / 2) * y) * np.cos(x) * (np.sqrt(2) / 2)
    h21 = np.sin((np.sqrt(2) / 2) * y) * np.cos(x) * (np.sqrt(2) / 2)
    return np.array([[h1, h12], [h21, h2]])


def newtons_method(x_init, stop):
    x_values = [x_init]
    x_new = x_init.copy()
    x_prev = x_init + stop + 30
    iteration_count = 0
    while la.norm(gradient(x_new)) >= stop:
        x_prev = x_new
        s = -la.solve(hessian(x_prev), gradient(x_prev))
        x_new = x_prev + s
        x_values.append(x_new)
        iteration_count += 1
    x_values = np.array(x_values)
    return x_new, iteration_count, x_values


r_sd, iteration_count_sd, val_sd = steepest_descent(r_init, stop)
r_newton, iteration_count_newton, val_newton = newtons_method(r_init, stop)

# Get 2-norm of error for each iteration result of both methods
diff_sd = la.norm(val_sd - r_sd, axis=1)
diff_newton = la.norm(val_newton - r_newton, axis=1)

# Define x-axis of the plot
x_axis_sd = range(iteration_count_sd)
x_axis_newton = range(iteration_count_newton)

# remove the last point, we don't want to compute the log of zero
diff_sd = np.log(diff_sd[:-1])
diff_newton = np.log(diff_newton[:-1])

# # Plot
# plt.figure()
# plt.title("Error comparison of Steepest Descent and Newton Method")
# plt.xlabel("Iteration Number")
# plt.ylabel("Log(2-Norm of Error)")
# plt.plot(x_axis_newton, diff_newton, c='b', label='Newton Method')
# plt.plot(x_axis_sd, diff_sd, c='r', label='Steepest Descent')
# plt.legend()
# plt.show()
