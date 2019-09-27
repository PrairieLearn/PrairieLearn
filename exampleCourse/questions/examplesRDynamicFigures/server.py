import io
import numpy
import random

# Create a pandas data.frame
import pandas as pd

# Required to convert to R data frame from pandas
from rpy2.robjects.lib import grdevices

# Required to generate the byte stream
from rpy2.ipython.ggplot import image_png
import rpy2.robjects.lib.ggplot2 as ggplot2

def file(data):
    # Dynamically create the figure
    if data['filename']=='figure.png':

        # compute values
        x = numpy.linspace(-5,5)
        y = data['params']['m'] * x + data['params']['b']
                
        # Construct a data.frame
        df = pd.DataFrame({'x': x, 'y': y})
        
        # Explicit conversion
        # r_df = pandas2ri.py2ri(df)

        # Construct a ggplot2 graph
        gp = ggplot2.ggplot(df)
        pp = (gp
              + ggplot2.aes_string(x='x', y='y')
              + ggplot2.geom_point()
              + ggplot2.labs(title="MY DATA", x='x', y='y'))

    
        # Save the figure and return it as a buffer
        with grdevices.render_to_bytesio(grdevices.png,
                                     width=500,
                                     height=500) as buf:
          image_png(pp)

        return buf

def generate(data):
    # Pick a non-zero slope
    if random.randint(0, 1) == 1:
        m = random.randint(-4, -1)
    else:
        m = random.rantint(1, 4)
    
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
