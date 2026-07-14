import random

import prairielearn as pl
import schemdraw.elements as elm
from schemdraw import Drawing


def file(data):
    if data["filename"] != "figure.svg":
        return None

    params_dict = data["params"]

    drawing = Drawing()
    # Outer loop: battery on the left edge, switch A and R1 along the top edge
    drawing += elm.BatteryCell().up().label(["$-$", params_dict["V_label"], "$+$"])
    drawing += elm.Switch().right().length(4).label("$A$")
    drawing += elm.Resistor().right().length(4).label(params_dict["R1_label"])
    drawing += elm.Line().down()
    drawing += elm.Line().left().length(1)

    # Interior section between two bottom nodes:
    # capacitor in parallel with (switch B + R2)
    drawing.push()
    drawing += elm.Capacitor().left().length(6).label(params_dict["C_label"], loc="bottom")
    drawing.pop()
    drawing += elm.Line().up().length(1.5)
    drawing += elm.Resistor().left().label(params_dict["R2_label"])
    drawing += elm.Switch().left().label("$B$")
    drawing += elm.Line().down().length(1.5)

    drawing += elm.Line().left().length(1)

    return drawing.get_imagedata()


def generate(data):
    ureg = pl.get_unit_registry()
    params_dict = data["params"]

    V = random.randint(12, 40) * ureg.volt
    R = random.sample([10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82], 2)
    R1 = R[0] * ureg.ohm
    R2 = R[1] * ureg.ohm
    C = random.randint(5, 15) * ureg.microfarad

    # Labels for the schemdraw figure, "~L" is the short latex format specifier
    params_dict["V_label"] = f"${V:~L}$"
    params_dict["R1_label"] = f"$R_1 = {R1:~L}$"
    params_dict["R2_label"] = f"$R_2 = {R2:~L}$"
    params_dict["C_label"] = f"$C = {C:~L}$"

    params_dict["alt"] = (
        "A circuit in which a battery, switch A, and resistor R1 are connected in "
        "series. This loop is closed by a capacitor C, which is connected in "
        "parallel with the series combination of switch B and resistor R2."
    )

    # With switch A closed and switch B open, no current flows at steady state,
    # so the full battery voltage appears across the capacitor: Q = C * V
    Q = (C * V).to(ureg.microcoulomb)
    data["correct_answers"]["ans"] = str(Q)
