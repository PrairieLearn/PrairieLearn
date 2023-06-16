import numpy as np

A, b = np.zeros((10, 10)), np.zeros((10,))

# Create dictionary that maps component name to column number
cols = {comp: i for i, comp in enumerate(components)}

for row, test in enumerate(test_data.values()):
    for comp, val in test:
        if comp == "EnergyConsumed":
            b[row] = val
        else:
            A[row, cols[comp]] = val

power_usage = np.linalg.solve(A, b)

"""
# Older more complicated solution
def find_val(alist_of_tuples, keyword):
    for tuples in alist_of_tuples:
        if tuples[0] == keyword:
            return(tuples[1])

# generate an A matrix and b rhs
m = len(test_data)
b = np.zeros(m,)
A = np.zeros([m, m])
for i, atest in enumerate(test_data):
    thedata = test_data[atest]
    b[i] = find_val(thedata, "EnergyConsumed")
    for j, entry in enumerate(components):
        A[i][j] = find_val(thedata, entry)

# solve the system Ax=b
power_usage = np.linalg.solve(A, b)
"""
