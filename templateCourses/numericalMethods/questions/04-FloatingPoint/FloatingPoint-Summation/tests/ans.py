import numpy as np


def compute_array_sum_accurately(data):

    # separating pos. and neg. to avoid cancellation
    plus_data = data[data > 0]
    neg_data = data[data < 0]

    # sorting to avoid FP errors of large_magniture_term + small_magnitude_term
    plus_data_sum = sum(np.sort(plus_data))

    # for negatives magnitude is obtained by multiplying with '-1'
    neg_data_sum = -sum(np.sort(-neg_data))

    data_sum = plus_data_sum + neg_data_sum

    return data_sum


data_sum = compute_array_sum_accurately(data)
