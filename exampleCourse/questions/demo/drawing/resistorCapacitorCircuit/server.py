import random

import prairielearn as pl
import schemdraw
import schemdraw.elements as elm


def file(data):
    if data["filename"] != "figure.svg":
        return None

    params = data["params"]

    # Elements created inside the `with` block are added to the drawing automatically,
    # and each one starts where the previous one ended.
    with schemdraw.Drawing(show=False) as drawing:
        battery = elm.BatteryCell().right().length(5).label(params["V_label"])
        elm.Resistor().right().length(5).label(params["R1_label"])
        elm.Line().down().length(4)
        elm.Line().left().length(2)
        elm.Dot()
        right_junction = drawing.here

        # Parallel branch: the capacitor on the bottom, switch B and R2 on top.
        elm.Line().down().length(1)
        elm.Capacitor().left().length(6).label(params["C_label"], loc="bottom")
        elm.Line().up().length(1)
        elm.Dot()
        left_junction = drawing.here
        elm.Line().up().length(1)
        elm.Switch().right().length(3).label("B")
        elm.Resistor().right().length(3).label(params["R2_label"])
        elm.Line().down().to(right_junction)

        # Return path through switch A, which has been closed for a long time.
        elm.Line().at(left_junction).left().length(2)
        elm.Switch(nc=True).up().toy(battery.start).label("A")

    return drawing.get_imagedata("svg")


def generate(data):
    ureg = pl.get_unit_registry()

    V = random.randint(12, 40) * ureg.volt
    R = random.sample([10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82], 2)
    R1, R2 = R[0] * ureg.ohm, R[1] * ureg.ohm
    C = random.randint(5, 15) * ureg.microfarad

    # LaTeX labels for the circuit figure
    data["params"]["V_label"] = f"${V:~L}$"
    data["params"]["R1_label"] = f"${R1:~L}$"
    data["params"]["R2_label"] = f"${R2:~L}$"
    data["params"]["C_label"] = f"${C:~L}$"

    # With B open, R2 carries no current, so the capacitor is in series with the
    # battery and R1. After A has been closed for a long time the capacitor is
    # fully charged, no current flows through R1, and the full battery voltage
    # appears across C.
    Q = C * V
    data["correct_answers"]["charge"] = str(Q.to(ureg.microcoulomb))
