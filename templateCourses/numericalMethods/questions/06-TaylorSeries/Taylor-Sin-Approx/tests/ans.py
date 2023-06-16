import math


def series_0_1(x):
    return x


def series_0_3(x):
    return x - (x**3 / 6)


def series_pi4_3(x):
    val = 1 / math.sqrt(2)
    x0 = math.pi / 4
    return (
        val + (val * (x - x0)) + (-val / 2) * (x - x0) ** 2 + (-val / 6) * (x - x0) ** 3
    )


def rel_error(approx, val):
    return abs((approx - val) / val)


xHat = 0.7
trueval = math.sin(xHat)

out_0_1 = series_0_1(xHat)
out_0_3 = series_0_3(xHat)
out_pi4_3 = series_pi4_3(xHat)

err_0_1 = rel_error(out_0_1, trueval)
err_0_3 = rel_error(out_0_3, trueval)
err_pi4_3 = rel_error(out_pi4_3, trueval)
