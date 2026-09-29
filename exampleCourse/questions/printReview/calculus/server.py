import random


def generate(data):
    a = random.randint(2, 6)
    b = random.randint(1, 5)
    data["params"].update(a=a, b=b, twob=2 * b)
    data["correct_answers"].update(
        derivative=f"{a}*x**2+{2 * b}*x-4", value=4 * a + 4 * b - 4
    )
