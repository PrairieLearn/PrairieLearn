import matplotlib.pyplot as plt
import io
import random
import numpy as np
import sympy as sym
import matplotlib as ml
ml.rcParams['text.usetex'] = True

def func(x,a,b,c):
    return a*x**3 + b*x**2 + c*x - 9


def generate(data):

    # generating the coefficients for the function
    a = random.choice([-1,0,1])
    b = random.choice([-1,1])
    c = random.choice([10,-10])

    data['params']['a'] = a
    data['params']['b'] = b
    data['params']['c'] = c

    # Generate the function for display
    x = sym.symbols('x')
    data['params']['f'] = sym.latex(a*x**3 + b*x**2 + c*x - 9)

    # Generate x and y values for the checkbox options
    xp = np.array([-6,-4,-2,0,2,4,6])
    yp = func(xp,a,b,c)

    # Generate question parameter
    option = np.random.choice(["positive", "negative"])
    data['params']['option'] = option

    # Determine the true and false options
    ysol = yp>0 if option=="positive" else yp<0
    solutions = ["true" if b else "false" for b in ysol]

    # Storing the correct answers in the data dictionary
    for i,s in enumerate(solutions):
        varName = "x" + str(i)
        data['params'][varName] = s


def file(data):

    if data['filename']=='figure.png':

        # Generate data points for the plot
        xp = np.linspace(-6, 6, num=60)
        a = data['params']['a']
        b = data['params']['b']
        c = data['params']['c']
        yp = func(xp,a,b,c)

        # Generate the plot
        fig, ax = plt.subplots()
        ax.plot(xp, yp)
        plt.xlabel(r"$x$")
        plt.ylabel(r"$f(x)$")
        plt.grid()
        plt.xlim(-6,6)

        # Save the figure and return it as a buffer
        buf = io.BytesIO()
        plt.savefig(buf, format='png')
        return buf
