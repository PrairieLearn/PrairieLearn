import matplotlib.pyplot as plt
import io
import random
import numpy as np
import scipy.linalg as sla
import prairielearn as pl
import pandas as pd

def generate(data):
    df = pd.io.parsers.read_csv("breast-cancer-train.dat", header=None)
    data['params']['df'] = pl.to_json(df.head(15))
    data['params']['matrix'] = pl.to_json(np.random.random((3, 3)))
    data['params']['my_dictionary'] = {'a': 1, 'b': 2, 'c': 3}
    
    return data
