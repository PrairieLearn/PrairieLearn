import random

from schemdraw import Drawing
import schemdraw.elements as elm

def file(data):
    if data["filename"] != "figure.svg":
        return
    
    drawing = Drawing()
    
    R1 = str(data["params"]["R1"]) + r" $\Omega$"
    R2 = str(data["params"]["R2"]) + r" $\Omega$"
    R3 = str(data["params"]["R3"]) + r" $\Omega$"
    Vt = str(data["params"]["Vt"]) + " V"

    match data["params"]["whichfig"]:
        case "R_T": # variant: Find total resistance

            # drawing the circuit using schemdraw
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

        case "I_T": # variant: Find current

            # drawing the circuit using schemdraw
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

    return drawing.get_imagedata()


def generate(data):

    # Randomly choose Vt, R1, R2, R3
    Vt = random.randint(100, 200)
    data["params"]["Vt"] = Vt

    R1 = random.choice(list(range(20, 180, 10)))
    data["params"]["R1"] = R1
    
    R2 = random.choice(list(range(20, 180, 20)))
    data["params"]["R2"] = R2
    
    R3 = random.choice(list(range(20, 100, 5)))
    data["params"]["R3"] = R3
    
    # Randomly choose variant of the question
    variant = random.choice([0, 1])
    match variant:
        case 0: # Equivalent resistance of 3 parallel resistors
            data["params"]["ask"] = "equivalent resistance $R_T$"
            data["params"]["whichfig"] = "R_T"
            data["params"]["lab"] = "$R_T$"
            data["params"]["unit"] = r"$\Omega$"
            
            # calculate and append the correct answer
            Rtinv = 1 / R1 + 1 / R2 + 1 / R3
            Rt = 1 / Rtinv
            data["correct_answers"]["ans"] = Rt

        case 1: # Current due to 3 resistors and voltage supply
            data["params"]["ask"] = "current from the power supply $I_T$"
            data["params"]["whichfig"] = "I_T"
            data["params"]["lab"] = "$I_T$"
            data["params"]["unit"] = "$A$"

            # calculate and append the correct answer
            Rt = R1 + R2 + R3
            It = Vt / Rt
            data["correct_answers"]["ans"] = It
