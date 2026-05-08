import math
import random


def generate(data):
    # gravity (m/s^2)
    g = 9.8

    # Loop until all displayed choices are unique.
    while True:
        # mass of the ball (kg)
        m = random.choice([3, 1.4, 1.6, 1.8])
        # angle with horizontal (in degrees)
        theta = random.randint(20, 40)
        # initial velocity  (m/s)
        v0 = random.randint(18, 25)
        # initial velocity components (m/s)
        v0x = v0 * math.cos(theta * math.pi / 180)
        v0y = v0 * math.sin(theta * math.pi / 180)

        if random.choice([
            0,
            1,
        ]):  # This variant provides the distance and asks for the time
            # horizontal distance (m)
            d = random.randint(4, 16)
            # time in the air (s)
            t = d / v0x
            # height of the cliff (m)
            h = round(v0y * t + 0.5 * g * t**2, 3)

            t_c = round(t, 3)
            t_x1 = round(math.sqrt(2 * h / g), 3)
            t_x2 = round(d / v0, 3)
            t_x3 = round(d / v0y, 3)
            t_x4 = round(h / v0y, 3)

            if len({t_c, t_x1, t_x2, t_x3, t_x4}) < 5:
                continue

            data["params"]["question_text"] = (
                "Suppose the ball hits the ground a distance $d = "
                + str(d)
                + "\\rm\\ m$ from the base of the cliff. How long is the ball in the air?"
            )
            data["params"]["t_c"] = "$t = " + str(t_c) + "\\rm\\ s$"
            data["params"]["t_x1"] = "$t = " + str(t_x1) + "\\rm\\ s$"
            data["params"]["t_x2"] = "$t = " + str(t_x2) + "\\rm\\ s$"
            data["params"]["t_x3"] = "$t = " + str(t_x3) + "\\rm\\ s$"
            data["params"]["t_x4"] = "$t = " + str(t_x4) + "\\rm\\ s$"

        else:  # This variant provides the time and asks for the distance
            # time in the air (s)
            t = round(random.uniform(0.5, 0.8), 2)
            # horizontal distance (m)
            d = v0x * t
            # height of the cliff (m)
            h = round(v0y * t + 0.5 * g * t**2, 3)

            d_c = round(d, 3)
            d_x1 = round(v0 * t, 3)
            d_x2 = round(v0y * t, 3)
            d_x3 = round(0.5 * g * t**2, 3)
            d_x4 = round(d + 0.5 * g * t**2, 3)

            if len({d_c, d_x1, d_x2, d_x3, d_x4}) < 5:
                continue

            data["params"]["question_text"] = (
                "Suppose the ball hits the ground after $t = "
                + str(t)
                + "\\rm\\ s$. What is the distance from the base of the cliff that the ball hits the ground?"
            )
            data["params"]["t_c"] = "$d = " + str(d_c) + "\\rm\\ m$"
            data["params"]["t_x1"] = "$d = " + str(d_x1) + "\\rm\\ m$"
            data["params"]["t_x2"] = "$d = " + str(d_x2) + "\\rm\\ m$"
            data["params"]["t_x3"] = "$d = " + str(d_x3) + "\\rm\\ m$"
            data["params"]["t_x4"] = "$d = " + str(d_x4) + "\\rm\\ m$"

        break

    data["params"]["m"] = m
    data["params"]["v0"] = v0
    data["params"]["theta"] = theta
    data["params"]["h"] = h
    # determines if the option "none of the above" will be used or not
    data["params"]["none"] = "false"  # random.choice(["false","true"])
