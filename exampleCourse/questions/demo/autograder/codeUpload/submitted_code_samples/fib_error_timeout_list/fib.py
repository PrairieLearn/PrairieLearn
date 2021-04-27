import random

def fib(n):
    c = 0
    for i in range(10000):
        a = [random.random() for j in range(10000)]
        a.sort()
        c += a[0]
    return c
