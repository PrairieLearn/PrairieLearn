import random
import numpy as np
import matplotlib.pyplot as plt
import io
import matplotlib as ml
ml.rcParams['text.usetex'] = True
plt.rcParams.update({'font.size': 14})
import os


def f(x):
    return 0.5*x**2 - 2

def generate(data):

    points = np.random.choice([-2,0,4],2,replace=False)
    b = int(max(points))
    a = int(min(points))
    data["params"]["a"] = a
    data["params"]["b"] = b

    h = abs(f(b) - f(a))
    base = abs(b - a)

    data['correct_answers']['base'] = base
    data['correct_answers']['height'] = h
    data['correct_answers']['slope'] = (f(b) - f(a))/(b - a)
    data['correct_answers']['va'] = (f(b) - f(a))/(b - a)

## The function 'file(data)' is used to generate the figure dynamically,
## given data defined in the 'generate' function
def file(data):

    if data['filename']=='figure1.png':
        #clear
        a0 = -4
        b0 = 7

        xmesh = np.linspace(a0, b0, 100)
        x = np.linspace(a0, b0)

        a = data['params']['a']
        b = data['params']['b']

        slope = (f(b)-f(a))/(b-a)
        fig = plt.figure()
        plt.plot(x,f(x),linewidth=3.0)
        plt.plot(xmesh, f(a) + slope*(xmesh-a),linewidth=3.0)
        plt.plot(a, f(a),'or',markersize=10)
        plt.plot(b, f(b),'or',markersize=10)
        plt.grid()
        plt.xlim(a0,b0)
        plt.ylim(-4,12)
        plt.xlabel(r"$x$", fontsize=20)
        plt.ylabel(r"$f(x)$", fontsize=20)
        plt.text(a-0.3, f(a)+0.6, "$a$", fontsize=20)
        plt.text(b-0.3, f(b)+0.6, "$b$", fontsize=20)

    # Save the figure and return it as a buffer
    buf = io.BytesIO()
    plt.savefig(buf,format='png')
    return buf
