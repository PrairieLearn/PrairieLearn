import io
import random

import matplotlib.pyplot as plt
import numpy as np

# from numpy.random import choice


def file(data):
    if data["filename"] == "figure.png":

        # create plt
        fig = plt.figure()
        ax = fig.add_subplot(1, 1, 1)

        npoints = 10
        n = np.linspace(0, 50, npoints)
        error = np.exp(5 - data["params"]["alpha"] * n)
        for i in range(npoints):
            error[i] = error[i] * random.choice([1.5, 0.5])
        plt.semilogy(n, error, "-")
        plt.grid()
        plt.xlabel("Running time (minutes)", fontsize=18)
        plt.ylabel("Error (degree Celsius)", fontsize=18)
        # plt.rcParams.update({'xtick.labelsize': 20,'ytick.labelsize': 20})
        plt.autoscale(enable=True, tight=True)
        # fig.set_tight_layout(True)

        # Save the figure and return it as a buffer
        buf = io.BytesIO()
        plt.savefig(buf, format="png")
        return buf


def generate(data):

    error = 1
    c = 0
    while abs(np.log10(error) + c) < 1:
        alpha = np.random.rand() / 2 + 0.5
        c = random.choice([2, 4, 6])
        # time = random.choice([10, 20])
        time = random.choices(population=[10, 20, 30], weights=[0.3, 0.5, 0.2], k=1)[0]

        error = np.exp(5 - time * alpha)

    if error >= 10 ** (-c):
        data["params"]["Aans"] = "true"
        data["params"]["Bans"] = "false"
    else:
        data["params"]["Aans"] = "false"
        data["params"]["Bans"] = "true"

    data["params"]["alpha"] = alpha
    data["params"]["c"] = c
    data["params"]["time"] = time


def grade(data):
    if data["score"] != 1.0:
        feedback = "Since the running time of Program A is fixed, to answer this problem, we need to find the running time of Program B. To determine the running time of Program B, we will look at the y-axis to find the error we want and see what the corresponding x-value is. If this x-value is less than Program A, then Program B is faster. Otherwise, Program A is faster."
    else:
        feedback = ""
    data["feedback"]["question_feedback"] = feedback
