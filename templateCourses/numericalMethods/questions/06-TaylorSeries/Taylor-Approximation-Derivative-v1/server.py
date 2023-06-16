import random


def cos_first_derivative(x):
    return -x


def e_x_first_derivative(x):
    return 1 + x


def generate(data):
    degree = 2
    x = random.choice([2, 3, 4, 5])
    rand = random.randint(0, 1)
    ret = 0

    if rand == 0:
        function = "$f(x) = \\cos (x)$"
        ret = cos_first_derivative(x)
    else:
        function = "$f(x) = e^x$"
        ret = e_x_first_derivative(x)

    data["params"]["function"] = function
    data["params"]["x"] = x
    data["params"]["degree"] = degree

    data["correct_answers"]["f"] = ret

    return data
