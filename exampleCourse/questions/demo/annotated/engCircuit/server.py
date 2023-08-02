import random

import prairielearn as pl
import schemdraw.elements as elm
from schemdraw import Drawing


def file(data):
    if data["filename"] != "figure.svg":
        return

    drawing = Drawing()
    params = data["params"]
    ureg = pl.get_unit_registry()

    # Re-parse quantities
    R1 = ureg.Quantity(params["R1"])
    R2 = ureg.Quantity(params["R2"])
    R3 = ureg.Quantity(params["R3"])
    Vt = ureg.Quantity(params["Vt"])

    # Generate labels, "~L" is the short latex format specifier
    R1_label = f"$R_1 = {R1:~L}$"
    R2_label = f"$R_2 = {R2:~L}$"
    R3_label = f"$R_3 = {R3:~L}$"
    Vt_label = f"$V_T = {Vt:~L}$"

    match data["params"]["whichfig"]:
        case 0:
            # variant: Find current
            # drawing the circuit using schemdraw
            drawing.push()
            drawing += elm.Line().right()
            drawing += elm.Line().right()
            drawing += elm.Line().right()
            drawing += elm.Line().down()
            drawing += elm.Resistor().left().label(R3_label)
            drawing += elm.Resistor().left().label(R2_label)
            drawing += elm.Resistor().left().label(R1_label)
            drawing.pop()
            drawing += elm.BatteryCell().down().label(Vt_label)

        case 1:
            # variant: Find total resistance
            # drawing the circuit using schemdraw
            drawing.push()
            drawing += elm.Line()
            drawing.push()
            drawing += elm.Resistor().down().label(R1_label)
            drawing.pop()
            drawing += elm.Line().right()
            drawing.push()
            drawing += elm.Resistor().down().label(R2_label)
            drawing.pop()
            drawing += elm.Line().right()
            drawing += elm.Resistor().down().label(R3_label)
            drawing += elm.Line().left()
            drawing += elm.Line().left()
            drawing += elm.Line().left()
            drawing.pop()
            drawing += elm.BatteryCell().down().label(Vt_label)

    return drawing.get_imagedata()


def generate(data):
    ureg = pl.get_unit_registry()

    # Randomly choose Vt, R1, R2, R3
    Vt = random.randint(100, 200) * ureg.volt
    data["params"]["Vt"] = str(Vt)
    data["params"]["Vt_quantity"] = int(Vt.magnitude)

    R1 = random.choice(list(range(20, 180, 10))) * ureg.ohm
    data["params"]["R1"] = str(R1)
    data["params"]["R1_quantity"] = int(R1.magnitude)

    R2 = random.choice(list(range(20, 180, 20))) * ureg.ohm
    data["params"]["R2"] = str(R2)
    data["params"]["R2_quantity"] = int(R2.magnitude)

    R3 = random.choice(list(range(20, 100, 5))) * ureg.ohm
    data["params"]["R3"] = str(R3)
    data["params"]["R3_quantity"] = int(R3.magnitude)

    # Next randomly choose which diagram to ask about and compute
    # the resistance
    whichfig = random.choice([0, 1])
    data["params"]["whichfig"] = whichfig

    match whichfig:
        case 0:
            # this is the series
            Rt = R1 + R2 + R3
        case 1:
            # this is the parallel
            Rtinv = 1 / R1 + 1 / R2 + 1 / R3
            Rt = 1 / Rtinv

    # Finally, choose what to ask about (current or resistance)
    # Note: This is independent of the previous choice of which figure.
    variant = random.choice([0, 1])
    match variant:
        case 0:
            data["params"]["ask"] = "equivalent resistance $R_T$"
            data["params"]["lab"] = "$R_T$"
            data["params"]["placeholder"] = "equivalent resistance"

            data["correct_answers"]["ans"] = str(Rt)

        case 1:
            data["params"]["ask"] = "current from the power supply $I_T$"
            data["params"]["lab"] = "$I_T$"
            data["params"]["placeholder"] = "current"

            It = (Vt / Rt).to_base_units()
            data["correct_answers"]["ans"] = str(It)
