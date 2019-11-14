import random
import numpy as np
import numpy.linalg as la
import prairielearn as pl

def generate(data):
  data['params']['weight1'] = random.randint(1, 10)
  data['params']['weight2'] = random.randint(1, 10)

  mat = np.random.random((3, 3))
  mat = mat / la.norm(mat, 1, axis=0)
  data['params']['labels'] = pl.to_json(['A', 'B', 'C'])
  data['params']['matrix'] = pl.to_json(mat)

  mat2 = np.random.binomial(1, 0.5, (3, 3))
  data['params']['matrix2'] = pl.to_json(mat2)
