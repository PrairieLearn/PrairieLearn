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

    # using the formula for elastic collision (v+vb = vo) and conservation of momentum
    # velocity of the bob and box right after the impact
    vb = (m - M) * v / (M + m)
    data["correct_answers"]["vb"] = vb
    # velocity of the object with mass M right after impact
    vo = v + vb
    data["correct_answers"]["vo"] = vo

    # impulse acting on M during collision F*t = m*delta(v)
    impulse = M * (vo - 0)
    data["correct_answers"]["imp"] = impulse

    # distance from the edge
    H = round(random.randint(30, 90) / 100, 2)
    data["params"]["H"] = H
    t = math.sqrt(2 * H / g)
    # distance from edge
    d = vo * t
    data["correct_answers"]["d"] = d
