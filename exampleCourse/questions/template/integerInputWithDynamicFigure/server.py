import random
import numpy as np
import matplotlib.pyplot as plt
import io
plt.rcParams.update({'font.size': 30})

def generate(data):

    # p = 1: the figure is a diamond
    # p = 2: the figure is a circle
    p = random.choice([1,2])
    data['params']['p'] = p
    ## define the desired dimension of the figure
    d = random.choice([1,2,3])
    data['params']['d'] = d

    if p == 1:
        data['params']['dname'] = "diamond diagonal"
    else:
        data['params']['dname'] = "circle diameter"

    data['correct_answers']['dim'] = 2*d


## The function 'file(data)' is used to generate the figure dynamically,
## given data defined in the 'generate' function
def file(data):

    ## This creates a dynamic figure (either a circle or diamond)
    ## depending on the parameters d and p defined in the 'generate' function
    if data['filename']=='figure0.png':

        d = data['params']['d']
        p = data['params']['p']

        phi = np.linspace(0, 2*np.pi, 500)
        x = np.cos(phi)
        y = np.sin(phi)
        r = np.zeros(len(x))

        for i in range(len(x)):
            r[i] = np.linalg.norm([x[i], y[i]], p)

        fig = plt.figure(figsize=(10,10))
        plt.plot(d*x/r, d*y/r,'o')
        plt.grid()
        plt.xlim([-4,4])
        plt.ylim([-4,4])

    # Save the figure and return it as a buffer
    buf = io.BytesIO()
    plt.savefig(buf,format='png')
    return buf
