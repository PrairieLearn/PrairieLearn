import random as rd
from collections import defaultdict

import pandas
import prairielearn as pl
import sympy as sp


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Jump Across Stream"
    data2["params"]["vars"]["units"] = "m"

    # define bounds of the variables
    m = rd.randint(100, 500)  # mass of the bear
    w_s = round(rd.uniform(2.0, 5.0), 1)  # width of the stream
    h_s = round(rd.uniform(1.0, 2.0), 1)  # difference in height between the two banks
    v_i = rd.randint(2, 4)  # i-component of the initial velocity
    v_j = rd.randint(2, 4)  # j-component of the initial velocity
    h_b = round(
        rd.uniform(h_s + 1, h_s + 3), 1
    )  # bear's initial height - always higher than the other bank

    # store the variables in the dictionary "params"
    data2["params"]["m"] = m
    data2["params"]["w_s"] = w_s
    data2["params"]["h_s"] = h_s
    data2["params"]["v_i"] = v_i
    data2["params"]["v_j"] = v_j
    data2["params"]["h_b"] = h_b

    # Declare math symbols to be used by sympy
    t, g, i_hat, j_hat = sp.symbols("t g i_hat j_hat")

    # define acceleration due to gravity, g (use 'a' here)
    a = 9.81

    ## Part 1

    # Describe the solution equation
    # s = u*t + 0.5*a*t^2; a = 0
    x = v_i * t

    # Answer to fill in the blank input stored as JSON.
    data2["correct_answers"]["part1_ans"] = pl.to_json(x)

    ## Part 2

    # Describe the solution equation
    # s = u*t + 0.5*a*t^2 ; a = -g
    y = v_j * t - (g / 2) * t**2

    # Answer to fill in the blank input stored as JSON.
    data2["correct_answers"]["part2_ans"] = pl.to_json(y)

    ## Part 3

    # Describe the solution equation
    Vx = str(v_i)

    # Answer to fill in the blank input stored as JSON.
    data2["correct_answers"]["part3_ans"] = pl.to_json(Vx)

    ## Part 4

    # Describe the solution equation
    Vy = v_j - g * t

    # Answer to fill in the blank input stored as JSON.
    data2["correct_answers"]["part4_ans"] = pl.to_json(Vy)

    ## Part 5
    # change in height
    y_needed = h_s - h_b

    # find the time needed to just make it to the other side
    d_t = w_s / v_i

    # find the change in height during this time period
    y_travelled = v_j * d_t - (a / 2) * d_t**2

    # define possible answers
    # a jump is successful when y_travelled >= y_needed

    if y_travelled >= y_needed:
        data2["params"]["part5"]["ans1"][
            "value"
        ] = "Yes, the bear makes it to the other side of the stream."
        data2["params"]["part5"]["ans1"]["correct"] = True

        data2["params"]["part5"]["ans2"][
            "value"
        ] = "No, the bear does not make it to the other side of the stream."
        data2["params"]["part5"]["ans2"]["correct"] = False
    else:
        # y_travelled < y_needed

        data2["params"]["part5"]["ans1"][
            "value"
        ] = "Yes, the bear makes it to the other side of the stream."
        data2["params"]["part5"]["ans1"]["correct"] = False

        data2["params"]["part5"]["ans2"][
            "value"
        ] = "No, the bear does not make it to the other side of the stream."
        data2["params"]["part5"]["ans2"]["correct"] = True

    ## Part 6 and Part 7

    # at highest position v_j = 0
    # find the time the highest position is reached
    time_highest = v_j / a

    # define correct answers
    data2["correct_answers"]["part6_ans"] = v_i * time_highest
    data2["correct_answers"]["part7_ans"] = (
        v_j * time_highest - 0.5 * a * time_highest**2
    )

    ## Part 8

    # Describe the solution equation
    Vf = v_i * i_hat + 0 * j_hat

    # Answer to fill in the blank input stored as JSON.
    data2["correct_answers"]["part8_ans"] = pl.to_json(Vf)

    ## Part 9

    # define possible answers
    data2["params"]["part9"]["ans1"][
        "value"
    ] = "The problem would become a 1-D problem with motion only in the $y$-direction."
    data2["params"]["part9"]["ans1"]["correct"] = True

    data2["params"]["part9"]["ans2"][
        "value"
    ] = "The problem would become a 1-D problem with motion only in the $x$-direction."
    data2["params"]["part9"]["ans2"]["correct"] = False

    # Update the data object with a new dict
    data.update(data2)


def create_data2():

    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()
