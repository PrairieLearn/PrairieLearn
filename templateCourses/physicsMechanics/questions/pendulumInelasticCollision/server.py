import math
import random


def generate(data):

    g = 9.8
    # angle
    theta = random.choice([30, 35, 40, 45])
    data["params"]["theta"] = theta
    theta = theta * math.pi / 180
    # masses
    m = round(random.randint(10, 20) / 10, 1)
    M = random.randint(3, 5)
    data["params"]["m"] = m
    data["params"]["M"] = M
    # Length
    L = round(random.randint(10, 20) / 10, 1)
    data["params"]["L"] = L

    # velocity of the bob right before the impact
    h = L - L * math.cos(theta)
    v = math.sqrt(2 * g * h)
    data["correct_answers"]["v"] = v

    # velocity of the bob rebound
    r = random.choice([2, 3])
    vb = round(v / r, 2)
    data["params"]["vb"] = vb
    vb = -vb

    # velocity of the ball right after the impact
    vo = (m * v - m * vb) / M
    data["correct_answers"]["vo"] = vo

    # time of ball fall
    H = round(random.randint(10, 20) / 10, 1)
    data["params"]["H"] = H
    t = math.sqrt(2 * H / g)
    # distance from edge
    d = vo * t
    data["correct_answers"]["d"] = d

    return data
