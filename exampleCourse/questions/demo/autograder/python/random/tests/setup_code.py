import random

import numpy.random


def random_random():
    return numpy.random.rand()


random.random = random_random


def random_uniform(a, b):
    return (numpy.random.rand() * (a - b)) + b


random.uniform = random_uniform
