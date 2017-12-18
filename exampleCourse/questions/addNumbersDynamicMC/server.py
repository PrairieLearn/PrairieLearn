import random
from itertools import chain


def generate(data):
    answers = {}

    a = random.randint(-15, 15)
    b = random.randint(-15, 15)
    c = a + b

    data['params']['a'] = a
    data['params']['b'] = b

    # Generate the correct answer
    answers['correct'] = [str(c)]

    # Generate some incorrect answers
    # Select 4 unique deltas in [-6, -1] U [1, 6]
    deltas = random.sample(list(chain(range(-6, 0), range(1, 7))), 4)
    answers['incorrect'] = [str(c + delta) for delta in deltas]

    data['params']['addition_answers'] = answers
