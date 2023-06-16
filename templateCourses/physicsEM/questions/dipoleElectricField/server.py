import math
import random


def generate(data):

    pA = [100, 210]
    r = 150
    data["params"]["pA"] = pA

    theta1 = random.randint(30, 45)
    dtheta = random.randint(20, 40)
    theta2 = theta1 + random.choice([-1, 1]) * dtheta

    data["params"]["theta1"] = theta1
    theta1 = theta1 * math.pi / 180
    data["params"]["theta2"] = theta2
    theta2 = theta2 * math.pi / 180

    # for plotting purposes only
    pB = [pA[0] + r * math.cos(theta1), pA[1] - r * math.sin(theta1)]
    data["params"]["pB"] = pB
    p0 = [pA[0] + 0.5 * r * math.cos(theta1), pA[1] - 0.5 * r * math.sin(theta1)]
    data["params"]["p0"] = p0

    E = random.randint(50, 100)  # in kN/C
    data["params"]["E"] = E
    E = E * 1e3  # in N/C

    q = random.randint(1, 8)  # in *1e-19 C
    data["params"]["q"] = q
    q = q * 1e-19  # in C

    d = round(random.randint(100, 500) / 100, 2)  # in nm
    data["params"]["d"] = d
    d = d * 1e-9  # in m

    # Work
    U1 = q * d * E * math.cos(theta1)
    U2 = q * d * E * math.cos(theta2)
    W = (U2 - U1) / 1e-21
    data["correct_answers"]["W"] = W
