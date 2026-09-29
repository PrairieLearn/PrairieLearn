import random


def generate(data):
    length = random.choice([24, 30, 36, 42])
    width = random.choice([8, 10, 12])
    data["params"].update(
        length=length, width=width, spacing=6, perimeter=2 * (length + width)
    )
    data["correct_answers"].update(area=length * width, samples=length // 6 + 1)
