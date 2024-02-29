import math
import random

import numpy as np


def primes_from_2_to(n):
    """
    Return a set of primes p, 2 <= p < n.
    From https://codereview.stackexchange.com/a/42439
    """
    assert n >= 6  # Only works for this case

    prime = np.ones(n // 3 + (n % 6 == 2), dtype=bool)
    for i in range(3, math.isqrt(n) + 1, 3):
        if prime[i // 3]:
            p = (i + 1) | 1
            prime[p * p // 3 :: 2 * p] = False
            prime[p * (p - 2 * (i & 1) + 4) // 3 :: 2 * p] = False
    result = (3 * prime.nonzero()[0] + 1) | 1
    result[0] = 3
    return set(np.r_[2, result])


def generate(data):
    size_limit = 20
    concept = random.choice(["prime", "even", "odd"])
    data["params"]["concept"] = concept

    if concept == "prime":
        correct_set = primes_from_2_to(size_limit)
    elif concept == "even":
        correct_set = {num for num in range(1, size_limit) if num % 2 == 0}
    elif concept == "odd":
        correct_set = {num for num in range(1, size_limit) if num % 2 != 0}

    data["params"]["options"] = [
        {"correct": num in correct_set, "answer": str(num)}
        for num in range(1, size_limit)
    ]
