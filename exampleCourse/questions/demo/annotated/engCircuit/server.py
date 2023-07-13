import random
import io

import matplotlib.pyplot as plt
from schemdraw import Drawing
import schemdraw.elements as elm

def file(data):
    if data["filename"] == "figure.png":
        drawing = Drawing()
        R1 = str(data["params"]["R1"]) + " $\\Omega$"
        R2 = str(data["params"]["R2"]) + " $\\Omega$"
        R3 = str(data["params"]["R3"]) + " $\\Omega$"
        Vt = str(data["params"]["Vt"]) + "V"
        if data["params"]["ask"] == "equivalent resistance $R_T$":
            ## parallel resistors
            drawing.push()
            drawing += elm.Line()
            drawing.push()
            drawing += elm.Resistor().down().label(R1)
            drawing.pop()
            drawing += elm.Line().right()
            drawing.push()
            drawing += elm.Resistor().down().label(R2)
            drawing.pop()
            drawing += elm.Line().right()
            drawing += elm.Resistor().down().label(R3)
            drawing += elm.Line().left()
            drawing += elm.Line().left()
            drawing += elm.Line().left()
            drawing.pop()
            drawing += elm.BatteryCell().down().label(Vt,'bottom')
        else:
            ## Series resistors
            drawing.push()
            drawing += elm.Line().right()
            drawing += elm.Line().right()
            drawing += elm.Line().right()
            drawing += elm.Line().down()
            drawing += elm.Resistor().left().label(R3)
            drawing += elm.Resistor().left().label(R2)
            drawing += elm.Resistor().left().label(R1)
            drawing.pop()
            drawing += elm.BatteryCell().down().label(Vt,'bottom')
        drawing.draw(show=False)
        buf = io.BytesIO()                       
        plt.savefig(buf, format="png")  
        return buf

def generate(data):
    ask = ["equivalent resistance $R_T$", "current from the power supply $I_T$"]
    which = random.choice([0, 1])
    data["params"]["ask"] = ask[which]
    label = ["$R_T$", "$I_T$"]
    data["params"]["lab"] = label[which]

    Vt = random.randint(100, 200)
    data["params"]["Vt"] = Vt
    R1 = random.choice(list(range(20, 180, 10)))
    data["params"]["R1"] = R1
    R2 = random.choice(list(range(20, 180, 20)))
    data["params"]["R2"] = R2
    R3 = random.choice(list(range(20, 100, 5)))
    data["params"]["R3"] = R3
    unit = ["$\\Omega$", "A"]
    data["params"]["unit"] = unit[which]


    if not which: # Equivalent
        Rtinv = 1 / R1 + 1 / R2 + 1 / R3
        Rt = 1 / Rtinv
    else: # Series
        Rt = R1 + R2 + R3

    It = Vt / Rt
    ans = [Rt, It]
    data["correct_answers"]["ans"] = ans[which]