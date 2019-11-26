import matplotlib.pyplot as plt
import io
import random
import numpy

def file(data):
    if data['filename']=='figure.png':

        # Create the figure
        x = numpy.linspace(-5,5)
        f = data['params']['m']*x+data['params']['b']
        fig = plt.figure()
        ax = fig.add_subplot(1,1,1)
        plt.plot(x,f)
        plt.xticks([x for x in range(-5,6,1)], fontsize=14)
        fmin = int(numpy.floor(min(f))-1)
        fmax = int(numpy.ceil(max(f))+1)
        if fmax-fmin>12:
            plt.yticks([y for y in range(fmin,fmax+4,4)], fontsize=14)
            plt.axes().set_yticks([y for y in range(fmin,fmax+1,1)], minor=True)
            plt.axes().yaxis.grid(True, 'minor')
        else:
            plt.yticks([y for y in range(fmin,fmax+1,1)], fontsize=14)
        plt.grid()
        plt.xlabel('$x$', fontsize=18)
        plt.ylabel('$f(x)$', fontsize=18)
        plt.autoscale(enable=True, tight=True)
        fig.set_tight_layout(True)

        # Save the figure and return it as a buffer
        buf = io.BytesIO()
        plt.savefig(buf,format='png')
        return buf

def generate(data):
    # Pick a non-zero slope
    while(True):
        m = random.randint(-2,2)
        if m is not 0:
            break

    # Pick a y-intercept
    b = random.randint(-3,3)

    # Pick x
    x = random.randint(-5,5)

    # Find f(x)
    f = m*x+b

    data['params']['m'] = m
    data['params']['b'] = b
    data['params']['x'] = x
    data['correct_answers']['f'] = f
