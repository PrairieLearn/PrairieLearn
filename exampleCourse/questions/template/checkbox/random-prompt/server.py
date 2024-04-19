import random


def generate(data):
    size_limit = 20
    concept = random.choice(["prime", "even", "odd"])
    data["params"]["concept"] = concept

    if concept == "prime":
        # For the sake of this example, we use a hardcoded list of all primes
        # up to 20. Update this list if you change `size_limit`.
        correct_set = {2, 3, 5, 7, 11, 13, 17, 19}
    elif concept == "even":
        correct_set = {num for num in range(1, size_limit) if num % 2 == 0}
    elif concept == "odd":
        correct_set = {num for num in range(1, size_limit) if num % 2 != 0}

    data["params"]["options"] = [
        {"correct": num in correct_set, "answer": str(num)}
        for num in range(1, size_limit)
    ]
