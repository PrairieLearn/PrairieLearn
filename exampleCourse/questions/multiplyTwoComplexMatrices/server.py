import numpy as np
import prairielearn as pl

def generate(data):

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
    Are = np.random.random_integers(-numMax,numMax,(nRows,nInner))/(10**nDigits)
    Aim = np.random.random_integers(-numMax,numMax,(nRows,nInner))/(10**nDigits)
    Bre = np.random.random_integers(-numMax,numMax,(nInner,nCols))/(10**nDigits)
    Bim = np.random.random_integers(-numMax,numMax,(nInner,nCols))/(10**nDigits)
    A = Are + Aim*1j
    B = Bre + Bim*1j

    # Product of these two matrices
    C = A.dot(B)

    # Modify data and return
    data["params"]["A"] = pl.to_json(A)
    data["params"]["B"] = pl.to_json(B)
    data["correct_answers"]["C"] = pl.to_json(C)
