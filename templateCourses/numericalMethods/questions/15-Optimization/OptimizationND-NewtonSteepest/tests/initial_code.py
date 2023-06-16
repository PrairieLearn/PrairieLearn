import numpy as np


def f(r):
    x, y = r
    return 3 + ((x**2) / 8) + ((y**2) / 8) - np.sin(x) * np.cos((2**-0.5) * y)


# # Uncomment the code below for the plot.
# # Make sure you enter the needed variables first
# import matplotlib.pyplot as plt
# plt.figure()
# plt.title("Error comparison of Steepest Descent and Newton Method")
# plt.xlabel("Iteration Number")
# plt.ylabel("Log(2-Norm of Error)")
# plt.plot( ... , ... , c='b', label='Newton Method')
# plt.plot(... , ... , c='r', label='Steepest Descent')
# plt.legend()
# plt.show()
