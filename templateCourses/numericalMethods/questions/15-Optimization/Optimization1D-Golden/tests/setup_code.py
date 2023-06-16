import numpy as np
import scipy.optimize as opt

a = a_start = -10
b = b_start = 10
arr_type = type(np.zeros(2))


def f(x):
    if type(x) == arr_type:
        f.total_eval_count += len(x)
        f.student_eval_count += len(x)
    else:
        f.total_eval_count += 1
        f.student_eval_count += 1
    return x**2 + 0.4 * (x + 3) ** 2 + 10 * np.sin(x)


f.total_eval_count = 0

# Need a way to keep student count separate because f is not in names_from_user
def repeated_setup():
    f.student_eval_count = 0


def not_allowed(*args, **kwargs):
    raise RuntimeError("Calling this function is not allowed")


opt.golden = not_allowed
opt.minimize = not_allowed
opt.minimize_scalar = not_allowed
