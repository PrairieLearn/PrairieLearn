import math
import random


def generate(data):

    # Randomize iceberg and sea water density

    r = random.randint(100, 150)  # meters
    h = random.randint(r - 6, r - 1)  # meters
    rhoc = 2500  # kg/m^3
    rhow = 1000  # kg/m^3
    g = 9.81  # m/s^2
    Mconc = rhoc * g * (math.pi * r**2 / 4) * r * (1 - 4 / 3 / math.pi)
    Mwater = rhow * g * h * h / 2 * (h / 3)
    SF = round(Mconc / Mwater, 2)

    select = random.randint(0, 1)

    if select == 0:
        unknown = SF
        given = "the maximum fill height, $h =$ " + str(h) + " m"
        question = "the safety factor (SF) for this design"
        answer = "SF ="
        unit = ""
    else:
        unknown = h
        given = "the safety factor of this design, SF = " + str(SF)
        question = "the corresponding maximum fill height, $h$ for this design"
        answer = "$h =$"
        unit = "m"

    data["params"]["r"] = r
    data["params"]["given"] = given
    data["params"]["question"] = question
    data["params"]["answer"] = answer
    data["params"]["unit"] = unit
    data["correct_answers"]["unknown"] = unknown

    return data
