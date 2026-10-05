import random

import prairielearn as pl
import schemdraw
import schemdraw.elements as elm


def file(data):
    if data["filename"] != "figure.svg":
        return None

    params_dict = data["params"]

    with schemdraw.Drawing(show=False) as drawing:
        # Top edge left half: battery from pA to pB
        drawing += (
            elm.BatteryCell()
            .at((params_dict["pA"][0], -params_dict["pA"][1]))
            .to((params_dict["pB"][0], -params_dict["pB"][1]))
            .label(params_dict["V_label"])
        )

        # Top edge right half: resistor R1 from pB to pC (same placement as the original)
        drawing += (
            elm.Resistor()
            .at((params_dict["pB"][0], -params_dict["pB"][1]))
            .to((params_dict["pC"][0], -params_dict["pC"][1]))
            .label(params_dict["R1_label"])
        )

        # Right edge: line pC down to pD
        drawing += (
            elm.Line()
            .at((params_dict["pC"][0], -params_dict["pC"][1]))
            .to((params_dict["pD"][0], -params_dict["pD"][1]))
        )

        # Bottom edge right: line pD -> pE
        drawing += (
            elm.Line()
            .at((params_dict["pD"][0], -params_dict["pD"][1]))
            .to((params_dict["pE"][0], -params_dict["pE"][1]))
        )

        # Bottom edge left: line pE -> pF
        drawing += (
            elm.Line()
            .at((params_dict["pE"][0], -params_dict["pE"][1]))
            .to((params_dict["pF"][0], -params_dict["pF"][1]))
        )

        # Switch A: pA -> pF along the left edge (closed for a long time — normally-closed)
        drawing += (
            elm.Switch(nc=True)
            .at((params_dict["pA"][0], -params_dict["pA"][1]))
            .to((params_dict["pF"][0], -params_dict["pF"][1]))
            .label("A")
        )

        # Branch left side: line pJ -> pK (vertical, passes through junction pG)
        drawing += (
            elm.Line()
            .at((params_dict["pJ"][0], -params_dict["pJ"][1]))
            .to((params_dict["pK"][0], -params_dict["pK"][1]))
        )

        # Branch top: resistor R2 from pL to pH (same placement as the original)
        drawing += (
            elm.Resistor()
            .at((params_dict["pL"][0], -params_dict["pL"][1]))
            .to((params_dict["pH"][0], -params_dict["pH"][1]))
            .label(params_dict["R2_label"])
        )

        # Branch right side: line pH -> pI (vertical)
        drawing += (
            elm.Line()
            .at((params_dict["pH"][0], -params_dict["pH"][1]))
            .to((params_dict["pI"][0], -params_dict["pI"][1]))
        )

        # Switch B: pJ -> pL on the branch top (open)
        drawing += (
            elm.Switch()
            .at((params_dict["pJ"][0], -params_dict["pJ"][1]))
            .to((params_dict["pL"][0], -params_dict["pL"][1]))
            .label("B")
        )

        # Capacitor: pK -> pI on the branch bottom
        drawing += (
            elm.Capacitor()
            .at((params_dict["pK"][0], -params_dict["pK"][1]))
            .to((params_dict["pI"][0], -params_dict["pI"][1]))
            .label(params_dict["C_label"])
        )

    return drawing.get_imagedata()


def generate(data):
    ureg = pl.get_unit_registry()

    V = random.randint(12, 40) * ureg.volt
    R = random.sample([10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82], 2)
    R1, R2 = R[0] * ureg.ohm, R[1] * ureg.ohm
    C = random.randint(5, 15) * ureg.microfarad

    # LaTeX labels for the circuit figure
    data["params"]["V_label"] = f"$V = {V:~L}$"
    data["params"]["R1_label"] = f"$R_1 = {R1:~L}$"
    data["params"]["R2_label"] = f"$R_2 = {R2:~L}$"
    data["params"]["C_label"] = f"$C = {C:~L}$"

    # Magnitudes for pl-variable-output display (per #10712 pattern)
    data["params"]["V_quantity"] = int(V.magnitude)
    data["params"]["R1_quantity"] = int(R1.magnitude)
    data["params"]["R2_quantity"] = int(R2.magnitude)
    data["params"]["C_quantity"] = int(C.magnitude)

    # Physics: switch B is open, so the capacitor branch is fully disconnected
    # and carries no current; switch A closed for a long time charges the
    # capacitor directly across the source:
    #   Q = C * V
    # (Matches the original demo's answer key and the stated switch
    # conditions — see review discussion on #15929.)
    Q = C * V
    data["correct_answers"]["charge"] = str(Q.to_base_units())

    # Circuit geometry (unchanged from the original pl-drawing version)
    pA = [60, 60]
    L = 300
    h = 120

    pB = [pA[0] + L / 2, pA[1]]
    pC = [pA[0] + L, pA[1]]
    pD = [pA[0] + L, pA[1] + h]
    pE = [pA[0] + 4 / 5 * L, pA[1] + h]
    pF = [pA[0], pA[1] + h]
    pG = [pA[0] + 1 / 5 * L, pB[1] + h]
    pH = [pE[0], pE[1] - h / 4]
    pI = [pE[0], pE[1] + h / 4]
    pJ = [pG[0], pG[1] - h / 4]
    pK = [pG[0], pG[1] + h / 4]
    pL = [pF[0] + L / 2, pG[1] - h / 4]

    data["params"]["pA"] = pA
    data["params"]["pB"] = pB
    data["params"]["pC"] = pC
    data["params"]["pD"] = pD
    data["params"]["pE"] = pE
    data["params"]["pF"] = pF
    data["params"]["pG"] = pG
    data["params"]["pH"] = pH
    data["params"]["pI"] = pI
    data["params"]["pJ"] = pJ
    data["params"]["pK"] = pK
    data["params"]["pL"] = pL
