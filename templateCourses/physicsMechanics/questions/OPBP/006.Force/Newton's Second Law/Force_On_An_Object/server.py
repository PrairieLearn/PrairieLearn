import random
from collections import defaultdict


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Force On An Object"

    # Randomize Variables
    m = random.randint(20, 40)

    # store the variables in the dictionary "params"
    data2["params"]["m"] = m

    # define possible answers
    data2["params"]["part1"]["ans1"]["value"] = f"$F = $ {m*-2.5} $N$"
    data2["params"]["part1"]["ans1"]["correct"] = True

    data2["params"]["part1"]["ans2"]["value"] = f"$F = $ {m*2.5} $N$"
    data2["params"]["part1"]["ans2"]["correct"] = False

    data2["params"]["part1"]["ans3"][
        "value"
    ] = f"$F = $ {m*2.5} $N$ from 2 to 6 $s$, then $F = $ {m*-2.5} $N$ from 6 to 10 $s$"
    data2["params"]["part1"]["ans3"]["correct"] = False

    data2["params"]["part1"]["ans4"][
        "value"
    ] = f"$F = $ {m*-2.5} $N$ from 2 to 6 $s$, then $F = $ {m*2.5} $N$ from 6 to 10 $s$"
    data2["params"]["part1"]["ans4"]["correct"] = False

    data2["params"]["part1"]["ans5"]["value"] = "Impossible to tell"
    data2["params"]["part1"]["ans5"]["correct"] = False

    # Update the data object with a new dict
    data.update(data2)
