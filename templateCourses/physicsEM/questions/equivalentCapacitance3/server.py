import random


def generate(data):

    pA = [240, 20]
    L = 100

    points = {
        "pA": pA,
        "pB": [pA[0], pA[1] + L],
        "pC": [pA[0] - L, pA[1] + L],
        "pD": [pA[0] + L, pA[1] + L],
        "pF": [pA[0] - L, pA[1] + 2 * L],
        "pE": [pA[0] - 2 * L, pA[1] + 2 * L],
        "pG": [pA[0] + L, pA[1] + 2 * L],
        "pH": [pA[0] + 2 * L, pA[1] + 2 * L],
        "pI": [pA[0] - 2 * L, pA[1] + 3 * L],
        "pJ": [pA[0] - L, pA[1] + 3 * L],
        "pL": [pA[0] + L, pA[1] + 3 * L],
        "pM": [pA[0] + 2 * L, pA[1] + 3 * L],
        "pK": [pA[0], pA[1] + 3 * L],
        "pN": [pA[0], pA[1] + 4 * L],
    }
    # microF
    capacitors = {
        "AB": random.choice([0, random.randint(2, 20)]),
        "CF": random.choice([0, random.randint(2, 20)]),
        "DG": random.choice([0, random.randint(2, 20)]),
        "FJ": random.choice([0, random.randint(2, 20)]),
        "GL": random.choice([0, random.randint(2, 20)]),
        "KN": random.choice([0, random.randint(2, 20)]),
        "EI": random.randint(2, 20),
        "HM": random.randint(2, 20),
        "BK": random.randint(2, 20),
        "CB": 0,
        "BD": 0,
        "EF": 0,
        "GH": 0,
        "IM": 0,
    }

    line_list = ""
    for key in capacitors:
        line_list += html_line(
            points["p" + key[0]], points["p" + key[1]], capacitors[key]
        )

    data["params"]["randomItems"] = line_list

    C1 = capacitors["EI"] + capacitors["FJ"]
    C2 = capacitors["GL"] + capacitors["HM"]
    C3 = 1 / (1 / capacitors["CF"] + 1 / C1) if capacitors["CF"] != 0 else C1
    C4 = 1 / (1 / capacitors["DG"] + 1 / C2) if capacitors["DG"] != 0 else C2
    C5 = C3 + C4 + capacitors["BK"]
    Ckninv = 1 / capacitors["KN"] if capacitors["KN"] != 0 else 0
    Cabinv = 1 / capacitors["AB"] if capacitors["AB"] != 0 else 0
    Ceq = 1 / (1 / C5 + Ckninv + Cabinv)

    data["correct_answers"]["C"] = Ceq


def html_line(p1, p2, C):
    if C == 0:
        line = f"<pl-line x1={p1[0]} y1={p1[1]} x2={p2[0]}  y2={p2[1]} ></pl-line>"
    else:
        line = f'<pl-capacitor x1={p2[0]} y1={p2[1]} x2={p1[0]}  y2={p1[1]}  label="{C}\\\mu F" offsetx="40" offsety="25"></pl-capacitor>'
    return line
