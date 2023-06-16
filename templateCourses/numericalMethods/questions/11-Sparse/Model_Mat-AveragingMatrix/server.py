import numpy as np
import prairielearn as pl


def generate(data):
    dimensions = np.random.randint(4, 7)

    window_starting_idx = np.random.randint(-(dimensions // 2) + 1, 0)
    window_ending_idx = np.random.randint(0, (dimensions // 2) + 1)

    idx_within_window = np.arange(window_starting_idx, window_ending_idx + 1)

    # Build the string for the window to use
    window = ""
    for num in idx_within_window:
        if num < 0:
            window += "$v_{i" + str(num) + "}$, "
        elif num == 0:
            window += "$v_{i}$, "
        else:
            window += "$v_{i+" + str(num) + "}$, "
    window = window.strip(", ")

    # Build the string for the example window
    example_entry = "$w_" + str(0 - window_starting_idx) + "$"
    example_window = ""
    for num in idx_within_window:
        example_window += "$v_{" + str(num - window_starting_idx) + "}$, "
    example_window = example_window.strip(", ")

    # Build the string for the example window at an endpoint
    example_point = 0
    example_endpoint = "$w_" + str(example_point) + "$"
    example_endpoint_window = ""
    for num in idx_within_window:
        if (example_point + num >= 0) and (example_point + num < dimensions):
            example_endpoint_window += "$v_{" + str(example_point + num) + "}$, "
    example_endpoint_window = example_endpoint_window.strip(", ")

    # Build Averaging matrix
    A = np.zeros((dimensions, dimensions))
    for i in range(dimensions):
        for num in idx_within_window:
            # If window is correct
            if (i + num >= 0) and (i + num < dimensions):
                A[i, i + num] = 1.0

    nonzero = sum(sum(A))
    # Bytes for data, row, and column arrays
    num_bytes = 8 * nonzero + 4 * nonzero + 4 * nonzero

    # Normalize rows of A
    for i in range(dimensions):
        A[i, :] /= np.sum(A[i, :])

    data["params"]["dimensions"] = dimensions
    data["params"]["window"] = window

    data["params"]["example_window"] = example_window
    data["params"]["example_entry"] = example_entry
    data["params"]["example_endpoint"] = example_endpoint
    data["params"]["example_endpoint_window"] = example_endpoint_window

    data["correct_answers"]["A"] = pl.to_json(A)
    data["correct_answers"]["num_bytes"] = num_bytes
    return data


def construct_matrix(A):
    out = ""
    for i in range(A.shape[0]):
        row = "$w_%d = " % i
        for j in range(A.shape[1]):
            row += "%f v_%d" % (A[i][j], j)
            if j < A.shape[1] - 1:
                row += "+"
        row += "$"
        out += row
    return out


def grade(data):
    feedback = "<h4><b>Feedback:</b></h4>"
    if data["score"] != 1.0:
        sub_A = data["submitted_answers"]["A"]["_value"]
        sub_num_bytes = data["submitted_answers"]["num_bytes"]
        if not np.array_equal(sub_A, data["correct_answers"]["A"]):
            feedback += "<p><b>Incorrect</b> matrix A. Submitted matrix A results in following value for w:</p>"
            feedback += construct_matrix(np.array(sub_A))
            feedback += "<hr>"

        if sub_num_bytes != data["correct_answers"]["num_bytes"]:
            feedback += "<p><b>Incorrect</b> num_bytes</p>"
            feedback += "<hr>"

        feedback += '<p>For more info on matrix operations, please consult the <a href="https://courses.engr.illinois.edu/cs357/sp2021/notes/ref-8-vec-mat.html">reference page</a>.</p>'
    data["feedback"]["question_feedback"] = feedback
