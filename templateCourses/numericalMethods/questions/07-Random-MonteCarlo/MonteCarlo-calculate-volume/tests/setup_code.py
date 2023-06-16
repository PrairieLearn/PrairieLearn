import random

import numpy as np

Seed = np.random.randint(1000)


def repeated_setup():
    np.random.seed(Seed)


def random_random():
    return np.random.rand()


random.random = random_random


def random_uniform(a, b):
    return (np.random.rand() * (a - b)) + b


random.uniform = random_uniform
