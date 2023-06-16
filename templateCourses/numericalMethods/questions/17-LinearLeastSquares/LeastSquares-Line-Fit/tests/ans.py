import matplotlib.pyplot as plt
import numpy as np
import numpy.linalg as la

# data = np.array([[2005, 2006, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015],
#                  [  12,   41,   63,   72,   78,   80,   83,   88,   84,   90]])

data = np.array([year, percent])

n = data.shape[1]

A = np.ones((n, 2))
A[:, 1] = data[0].T

b = data[1]

c0, c1 = la.lstsq(A, b, rcond=None)[0]

plt.scatter(data[0], data[1], c="r")
plt.plot(data[0], c0 + c1 * data[0], "k")
plt.xlabel("Year")
plt.ylabel("Percent")
plt.title("18-29 Year Olds on Social Media in US")
plt.show()
