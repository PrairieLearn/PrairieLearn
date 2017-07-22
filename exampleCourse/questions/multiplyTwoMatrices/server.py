import numpy as np

def get_data(data, options):

    # Dimensions
    nInnerMin = 2
    nMax = 5
    nRows = np.random.randint(1,nMax+1)
    nInner = np.random.randint(nInnerMin,nMax+1)
    nCols = np.random.randint(1,nMax+1)

    # Number of digits after the decimal
    nDigits = 1

    # Range of entries
    numMax = 10

    # The two matrices to be multiplied
    A = np.random.random_integers(-numMax,numMax,(nRows,nInner))/(10**nDigits)
    B = np.random.random_integers(-numMax,numMax,(nInner,nCols))/(10**nDigits)

    # Product of these two matrices
    C = A.dot(B)

    params = {
        "A": A.tolist(),
        "B": B.tolist()
    }

    true_answer = {
        "C": C.tolist()
    }

    data = {
        "params": params,
        "true_answer": true_answer
    }

    return data

    # return {}
