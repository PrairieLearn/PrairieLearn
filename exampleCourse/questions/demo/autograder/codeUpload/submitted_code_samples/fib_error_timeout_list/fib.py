import random


def fib(n):
    c = 0
    for _ in range(10000):
        a = [random.random() for j in range(10000)]
        a.sort()
        c += a[0]
    return c
