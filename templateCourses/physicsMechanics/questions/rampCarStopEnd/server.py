import math
import random


def generate(data):

    g = 9.8
    v0 = random.randint(65, 80)  # in km/h
    data["params"]["v0"] = v0
    v0 = v0 * 1000 / (60 * 60)  # in m/s

    theta = random.randint(10, 20)  # in degrees
    data["params"]["theta"] = theta
    theta = theta * math.pi / 180  # in radians

    mu = round(0.4 + random.randint(1, 9) / 100, 2)
    d = 0.5 * v0**2 / (g * (math.sin(theta) + mu * math.cos(theta)))

    if random.choice([0, 1]):

        message = "Given a coefficient of friction for the gravel ground as " + str(mu)
        message += ", determine the minumum length of the ramp that will allow the truck to come to a stop."
        data["params"]["statement"] = message
        data["correct_answers"]["ans"] = d
        data["params"]["variable"] = "$d = $"
        data["params"]["unit"] = "m"
        data["params"]["dig"] = 3
    else:
        d = round(d, 2)
        message = "Given that the distance of the ramp is " + str(d) + " meters"
        message += ", determine the minumum coefficient of friction for the gravel ground that will allow the truck to come to a stop."
        data["params"]["statement"] = message
        mu = (0.5 * v0**2 - g * d * math.sin(theta)) / (d * g * math.cos(theta))
        data["correct_answers"]["ans"] = mu
        data["params"]["variable"] = "$\mu = $"
        data["params"]["unit"] = ""
        data["params"]["dig"] = 2
