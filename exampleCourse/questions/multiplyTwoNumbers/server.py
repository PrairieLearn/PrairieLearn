import numpy as np

def get_data(data, options):

    # Number of digits after the decimal
    nDigits = 1

    # Range of entries
    numMax = 10

    # The two matrices to be multiplied
    a = np.random.random_integers(-numMax,numMax)/(10**nDigits)
    b = np.random.random_integers(-numMax,numMax)/(10**nDigits)

    # Product of these two matrices
    c = a*b

    params = {
        "a": str(a),
        "a": b
    }

    true_answer = {
        "c": c
    }

    data = {
        "params": params,
        "true_answer": true_answer
    }

    return data

    # return {}
