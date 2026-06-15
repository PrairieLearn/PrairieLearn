def f(x):
    return x**2


def df(x):
    return 2 * x


def gradient_descent(x, alpha):
    return x - alpha * df(x)
