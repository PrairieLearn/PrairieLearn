import numpy as np
import prairielearn as pl

def generate(data):

    # Number of digits after the decimal
    nDigits = 1
    # Dimension
    n = np.random.randint(2,4)
    # Matrix
    A = np.round( np.random.rand(n,n), nDigits)
    # Product
    B = A@A.T
    # Return data
    data["params"]["nDigits"] = nDigits
    data["params"]["sigfigs"] = nDigits + 1
    data["params"]["A"] = pl.to_json(A)
    data["correct_answers"]["B"] = pl.to_json(B)
