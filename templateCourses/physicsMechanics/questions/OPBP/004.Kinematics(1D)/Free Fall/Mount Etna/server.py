import math
import random as rd


def generate(data):

    # define bounds of the variables
    h = round(rd.uniform(80.0, 120.0), 1)

    # store the variables in the dictionary "params"
    data["params"]["h"] = h

    # define g
    g = 9.81

    # calculate answer in m/s
    v_iy = math.sqrt(2 * g * h)

    # define correct answer in km/h
    data["correct_answers"]["part1_ans"] = v_iy * 3.6
