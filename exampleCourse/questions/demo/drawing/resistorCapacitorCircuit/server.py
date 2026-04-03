import random

import schemdraw
import schemdraw.elements as elm


def generate(data):
    V = random.randint(12, 40)
    data["params"]["V"] = V

    R = random.sample([10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82], 2)
    data["params"]["R1"] = R[0]
    data["params"]["R2"] = R[1]

    C = random.randint(5, 15)
    data["params"]["C"] = C

    # total charge
    data["correct_answers"]["charge"] = f"{C * V} uC"

    with schemdraw.Drawing(show=False) as d:
        d += elm.Switch().up().label("A")
        d += elm.Battery().right().label(f"{V} V")
        d += elm.Resistor().right().label(f"{R1} $\\Omega$")
        d += elm.Line().down()

        d.push()
        d += elm.Line().up().length(1.5)
        d += elm.Resistor().left().label(f"{R2} $\\Omega$")
        d += elm.Switch().left().label("B")
        d += elm.Line().down().length(1.5)
        d.pop()

        d += elm.Line().down().length(1.5)
        d += elm.Line().left().length(1.5)
        d += elm.Capacitor().left().label(f"{C} $\\mu$F")
        d += elm.Line().left().length(1.5)
        d += elm.Line().up().length(1.5)

        svg_bytes = d.get_imagedata("svg")
        data["params"]["circuit_svg"] = (
            svg_bytes.decode("utf-8") if isinstance(svg_bytes, bytes) else svg_bytes
        )
