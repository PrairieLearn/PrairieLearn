import random
from collections import defaultdict


def generate(data):

    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Electrons Accelerating"
    data2["params"]["vars"]["units"] = "$m$"

    # Randomize Variables
    dist = random.randint(10, 20)
    acc = random.randint(2, 6)

    # store the variables in the dictionary "params"
    data2["params"]["dist"] = dist
    data2["params"]["acc"] = acc

    # define correct answers

    # Coeff is the value in which the randomized coefficient value for time is squared and then divided by the same value because of the formula 1/2at^2. Where the coefficient for time is the same value that acceleration is divided by.

    coeff = acc**2 / acc
    ans = coeff * dist

    # define possible answers
    data2["params"]["part1"]["ans1"]["value"] = round(dist, 2)
    data2["params"]["part1"]["ans1"]["correct"] = False

    data2["params"]["part1"]["ans2"]["value"] = round(ans, 2)
    data2["params"]["part1"]["ans2"]["correct"] = True

    data2["params"]["part1"]["ans3"]["value"] = round(ans * acc, 2)
    data2["params"]["part1"]["ans3"]["correct"] = False

    data2["params"]["part1"]["ans4"]["value"] = round(dist / acc, 2)
    data2["params"]["part1"]["ans4"]["correct"] = False

    data2["params"]["part1"]["ans5"]["value"] = round(acc / dist, 2)
    data2["params"]["part1"]["ans5"]["correct"] = False

    # Update the data object with a new dict
    data.update(data2)


def create_data2():

    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()
