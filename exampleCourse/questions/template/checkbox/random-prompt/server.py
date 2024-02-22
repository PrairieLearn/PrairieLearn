import random

import numpy as np


def is_prime(a):
    if a == 1:
        return False
    return all(a % i for i in np.arange(2, a))


def generate(data):
    concept = random.choice(["prime", "even", "odd"])
    data["params"]["concept"] = concept

    is_odd_correct = str(concept == "odd").lower()
    is_even_correct = str(concept == "even").lower()

    options = []
    for num in np.arange(1, 20):
        if concept == "prime":
            options.append({"correct": str(is_prime(num)).lower(), "answer": str(num)})
        else:
            correct = is_even_correct if num % 2 == 0 else is_odd_correct
            options.append({"correct": correct, "answer": str(num)})

    data["params"]["options"] = options
