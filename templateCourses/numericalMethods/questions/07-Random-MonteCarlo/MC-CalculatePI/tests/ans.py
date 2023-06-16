import matplotlib.pyplot as plt
import numpy as np


# Part 1
def calculate_pi(x, y):
    in_circle = x**2 + y**2 < 1
    count = np.count_nonzero(in_circle)

    return count / len(x) * 4


# Part 2
max_log = 7

pi = np.zeros(max_log)
x = np.ndarray(max_log)

for i in range(max_log):
    size = 10**i
    x[i] = size

    pi[i] = calculate_pi(xs[:size], ys[:size])

# Part 3
error = np.abs(pi - np.pi)
plt.loglog(x, error)
plt.title("Estimating $\pi$ using Monte Carlo")
plt.xlabel("sample size")
plt.ylabel("error")

# Save plot for grading
plot = plt.gca()
