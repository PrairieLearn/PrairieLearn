import random

def generate(data):
    foods = ["pizza", "ice cream", "dumplings", "spinach", "arugula", "cilantro", "chocolate", "donuts"]
    servings = [100, 1000, 1000, -10, -10, -1000, 2000, 1500]
    index = random.randint(0, len(foods) - 1)
    data["params"]["food"] = foods[index]
    data["correct_answers"]["Servings"] = servings[index]

    return data
