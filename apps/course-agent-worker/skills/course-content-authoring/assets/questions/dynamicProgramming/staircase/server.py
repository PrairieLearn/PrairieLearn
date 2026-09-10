"""A minimal dynamic-programming question generator."""

import random


def generate(data: dict[str, dict[str, int]]) -> None:
    """Generate a staircase size and its exact count of move sequences."""
    n = random.randint(4, 9)
    previous, current = 1, 1
    for _ in range(2, n + 1):
        previous, current = current, previous + current
    data["params"]["n"] = n
    data["params"]["ways"] = current
    data["correct_answers"]["ways"] = current
