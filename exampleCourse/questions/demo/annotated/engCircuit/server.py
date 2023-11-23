import random

import prairielearn as pl
import schemdraw.elements as elm
from schemdraw import Drawing


def file(data):
    if data["filename"] != "figure.svg":
        return

    drawing = Drawing()
    params_dict = data["params"]
    battery_label_list = ["$+$", params_dict["Vt_label"], "$-$"]

    match params_dict["whichfig"]:
        case 0:
            # variant: Resistors in series
            drawing.push()
            drawing += elm.Line().right()
            drawing += elm.Line().right()
            drawing += elm.Line().right()
            drawing += elm.Line().down()
            drawing += elm.Resistor().left().label(params_dict["R3_label"])
            drawing += elm.Resistor().left().label(params_dict["R2_label"])
            drawing += elm.Resistor().left().label(params_dict["R1_label"])
            drawing.pop()
            drawing += elm.BatteryCell().down().label(battery_label_list)

        case 1:
            # variant: Resistors in parallel
            drawing.push()
            drawing += elm.Line()
            drawing.push()
            drawing += elm.Resistor().down().label(params_dict["R1_label"])
            drawing.pop()
            drawing += elm.Line().right()
            drawing.push()
            drawing += elm.Resistor().down().label(params_dict["R2_label"])
            drawing.pop()
            drawing += elm.Line().right()
            drawing += elm.Resistor().down().label(params_dict["R3_label"])
            drawing += elm.Line().left()
            drawing += elm.Line().left()
            drawing += elm.Line().left()
            drawing.pop()
            drawing += elm.BatteryCell().down().label(battery_label_list)

    return drawing.get_imagedata()


def generate(data):
    ureg = pl.get_unit_registry()
    params_dict = data["params"]

    # Randomly choose Vt, R1, R2, R3 with appropriate units
    Vt = random.randint(100, 200) * ureg.volt
    R1 = random.randrange(20, 180, 10) * ureg.ohm
    R2 = random.randrange(20, 180, 20) * ureg.ohm
    R3 = random.randrange(20, 100, 5) * ureg.ohm

    # Store magnitudes to present to the student
    params_dict["Vt_quantity"] = int(Vt.magnitude)
    params_dict["R1_quantity"] = int(R1.magnitude)
    params_dict["R2_quantity"] = int(R2.magnitude)
    params_dict["R3_quantity"] = int(R3.magnitude)

    # Generate labels for use in diagram, "~L" is the short latex format specifier
    params_dict["Vt_label"] = f"$V_T = {Vt:~L}$"
    params_dict["R1_label"] = f"$R_1 = {R1:~L}$"
    params_dict["R2_label"] = f"$R_2 = {R2:~L}$"
    params_dict["R3_label"] = f"$R_3 = {R3:~L}$"

    # Next randomly choose which diagram to ask about and compute
    # the resistance
    whichfig = random.choice([0, 1])
    params_dict["whichfig"] = whichfig

    match whichfig:
        case 0:
            # this is the series
            Rt = R1 + R2 + R3
            params_dict["alt"] = "A circuit with three resistors in series."
        case 1:
            # this is the parallel
            Rtinv = 1 / R1 + 1 / R2 + 1 / R3
            Rt = 1 / Rtinv
            params_dict["alt"] = "A circuit with three resistors in parallel."

    # Finally, choose what to ask about (current or resistance)
    # Note: This is independent of the previous choice of which figure.
    variant = random.choice([0, 1])
    match variant:
        case 0:
            params_dict["ask"] = "equivalent resistance $R_T$"
            params_dict["lab"] = "R_T"
            params_dict["placeholder"] = "equivalent resistance + unit"

            data["correct_answers"]["ans"] = str(Rt)

        case 1:
            params_dict["ask"] = "current from the power supply $I_T$"
            params_dict["lab"] = "I_T"
            params_dict["placeholder"] = "current + unit"

            It = (Vt / Rt).to_base_units()
            data["correct_answers"]["ans"] = str(It)
