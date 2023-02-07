import random

N = 100
num_pts = 0

for i in range(N):
    x = random.uniform(-1, 1)
    y = random.uniform(-1, 1)
    if (x**2 + y**2) <= 1:
        num_pts += 1

area = 4 * (num_pts / N)
