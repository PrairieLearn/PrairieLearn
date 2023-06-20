import random


def generate(data):

    pA = [60, 60]
    L = 100
    rs = random.sample(list(range(2, 20)), 6)

    points = {
        "pA": pA,
        "pB": [pA[0] + L, pA[1]],
        "pC": [pA[0] + 2 * L, pA[1]],
        "pD": [pA[0], pA[1] + L],
        "pE": [pA[0] + L, pA[1] + L],
        "pF": [pA[0] + 2 * L, pA[1] + L],
    }
    resistors = {
        "AB": rs[0],
        "BC": random.choice([0, rs[1]]),
        "DE": random.choice([0, rs[2]]),
        "EF": rs[3],
        "BE": random.choice([0, rs[4]]),
        "CF": rs[5],
    }

    line_list = ""
    for key in resistors:
        line_list += html_line(
            points["p" + key[0]], points["p" + key[1]], resistors[key]
        )

    data["params"]["randomItems"] = line_list
    data["params"]["pA"] = points["pA"]
    data["params"]["pD"] = points["pD"]

    V = random.randint(10, 20)
    data["params"]["V"] = str(V) + "V"

    R1 = resistors["BC"] + resistors["EF"] + resistors["CF"]
    R2 = 1 / (1 / resistors["BE"] + 1 / R1) if resistors["BE"] != 0 else R1
    Req = resistors["AB"] + resistors["DE"] + R2
    data["correct_answers"]["Req"] = Req

    data["params"]["R"] = resistors["EF"]
    It = V / Req
    current = It * R1 / (resistors["BE"] + R1)
    data["correct_answers"]["i"] = current

    data["params"]["R2"] = resistors["AB"]
    volt = resistors["AB"] * It
    data["correct_answers"]["v"] = volt


def html_line(p1, p2, C):
    if C == 0:
        line = f"<pl-line x1={p1[0]} y1={p1[1]} x2={p2[0]}  y2={p2[1]} ></pl-line>"
    else:
        line = f'<pl-resistor x1={p2[0]} y1={p2[1]} x2={p1[0]}  y2={p1[1]}  label="{C}\\\Omega" offsetx="20" offsety="25"></pl-resistor>'
    return line
