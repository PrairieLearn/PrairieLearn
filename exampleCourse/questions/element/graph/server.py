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
  data['params']['symmetric_matrix'] = pl.to_json(np.maximum(mat, mat.T))

  mat2 = np.random.binomial(1, 0.5, (3, 3))
  data['params']['matrix2'] = pl.to_json(mat2)

  mat3 = np.array([[None, 2, -1.5], [-1.1, -1.4, None], [None, 4, -2]])
  data['params']['matrix3'] = pl.to_json(mat3)

  # chosen by dice roll, guaranteed to be random
  edge_mat = np.array([[-1,  0,  1,  0],
                       [ 0, -1,  1,  0],
                       [ 1,  0,  0, -1],
                       [ 0,  1, -1,  0]])
  data['params']['edge-inc-mat'] = pl.to_json(edge_mat)
