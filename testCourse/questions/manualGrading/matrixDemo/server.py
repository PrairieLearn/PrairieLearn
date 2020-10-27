import prairielearn as pl
import numpy as np


def generate(data):

    # Generate a random 3x3 matrix
    mat = np.random.random((3, 3))

    # Answer to each matrix entry converted to JSON
    data['correct_answers']['matrixA'] = pl.to_json(mat)
