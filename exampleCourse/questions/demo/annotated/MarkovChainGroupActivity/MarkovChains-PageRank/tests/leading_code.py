import numpy.linalg as la
import numpy as np

A = np.array([[0,  2,  0,  5],
              [1,  0,  5,  6],
              [2,  4,  0,  3],
              [1,  0, 10,  2]])

num_pages = 20
edges = np.loadtxt("pagerank_large.txt").astype(np.int64)
A2 = np.zeros((num_pages, num_pages))
for edge in edges:
    A2[edge[1], edge[0]] = 1