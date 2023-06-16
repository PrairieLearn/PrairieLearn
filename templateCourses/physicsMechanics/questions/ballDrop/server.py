import random


def generate(data):

    # Acceleration going up
    t1 = random.randint(4, 10)
    ratio = random.choice([2, 3])
    t2 = ratio * t1
    if ratio == 2:
        data["params"]["ans3"] = "false"
        data["params"]["ans4"] = "false"
        if random.choice([0, 1]):
            data["params"]["t1"] = t1
            data["params"]["t2"] = t2
            data["params"]["ans1"] = "false"
            data["params"]["ans2"] = "true"
        else:
            data["params"]["t1"] = t2
            data["params"]["t2"] = t1
            data["params"]["ans1"] = "true"
            data["params"]["ans2"] = "false"
    else:
        data["params"]["ans1"] = "false"
        data["params"]["ans2"] = "false"
        if random.choice([0, 1]):
            data["params"]["t1"] = t1
            data["params"]["t2"] = t2
            data["params"]["ans3"] = "true"
            data["params"]["ans4"] = "false"
        else:
            data["params"]["t1"] = t2
            data["params"]["t2"] = t1
            data["params"]["ans3"] = "false"
            data["params"]["ans4"] = "true"
