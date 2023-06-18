import random

from sympy import *


def generate(data):

    t = symbols("t")

    r = randFuncArray(t, 3)

    t_value = random.randint(0, 2)

    v = diff(r, t)

    v_value = v.subs(t, t_value)

    v_answer = float(v_value.norm().evalf())

    data["params"]["position_x"] = latex(r[0])
    data["params"]["position_y"] = latex(r[1])
    data["params"]["position_z"] = latex(r[2])

    # for copyable inputs
    data["params"]["rx"] = str(r[0])
    data["params"]["ry"] = str(r[1])
    data["params"]["rz"] = str(r[2])
    data["params"]["t"] = t_value
    data["correct_answers"]["v"] = v_answer

    return data


# Create a random array of functions, where t is the variable, and n is the dimension of the vector
def randFuncArray(t, n):

    """t: independent variable
        n: size of the array
    returns an array of size n composed of functions that are exponential,
    trigonometric, or quadratic"""

    func_type = ["quad", "trig", "exp"]

    A_list = [-3, -2, -1, 1, 2, 3]
    B_list = [-3, -2, -1, 0, 1, 2, 3]
    C_list = B_list

    func_type_x = random.choice(func_type)
    func_type_y = random.choice(func_type)
    func_type_z = random.choice(func_type)

    if func_type_x == "quad":
        rx = (
            random.choice(A_list) * t**2
            + random.choice(B_list) * t
            + random.choice(C_list)
        )

    elif func_type_x == "trig":
        trig_type = random.choice(["sin", "cos"])
        if trig_type == "sin":
            rx = random.choice(A_list) * sin(random.choice(A_list) * t)
        else:
            rx = random.choice(A_list) * cos(random.choice(A_list) * t)

    else:
        rx = random.choice(A_list) * exp(random.choice(A_list) * t)

    if func_type_y == "quad":
        ry = (
            random.choice(A_list) * t**2
            + random.choice(B_list) * t
            + random.choice(C_list)
        )

    elif func_type_y == "trig":
        trig_type = random.choice(["sin", "cos"])
        if trig_type == "sin":
            ry = random.choice(A_list) * sin(random.choice(A_list) * t)
        else:
            ry = random.choice(A_list) * cos(random.choice(A_list) * t)

    else:
        ry = random.choice(A_list) * exp(random.choice(A_list) * t)

    if func_type_z == "quad":
        rz = (
            random.choice(A_list) * t**2
            + random.choice(B_list) * t
            + random.choice(C_list)
        )

    elif func_type_z == "trig":
        trig_type = random.choice(["sin", "cos"])
        if trig_type == "sin":
            rz = random.choice(A_list) * sin(random.choice(A_list) * t)
        else:
            rz = random.choice(A_list) * cos(random.choice(A_list) * t)

    else:
        rz = random.choice(A_list) * exp(random.choice(A_list) * t)

    if n == 2:
        r = Matrix([rx, ry, 0])
    elif n == 3:
        r = Matrix([rx, ry, rz])

    return r
