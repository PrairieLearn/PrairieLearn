import numpy as np
import prairielearn as pl


def generate(data):
    doRepeat = True
    while doRepeat:
        doRepeat = False

        correct = np.random.randint(0, 2, 4)
        correct[3] = 1

        A = np.random.randint(0, 4, 8).reshape((4, 2))
        last_element0 = 0
        for i in range(len(A) - 1):
            last_element0 -= correct[i] * A[i][0]
        A[-1][0] = last_element0

        last_element1 = 0
        for i in range(len(A) - 1):
            last_element1 -= correct[i] * A[i][1]
        A[-1][1] = last_element1

        notcorrect1 = np.array(correct)
        notcorrect1[0] += 1
        notcorrect2 = np.array(correct)
        notcorrect2[0] -= 1
        notcorrect3 = np.array(correct)
        notcorrect3[1] -= 2

        zeros = np.zeros(2)
        cor1 = np.allclose(zeros, A.T @ correct)
        ncor1 = not np.allclose(zeros, A.T @ notcorrect1)
        ncor2 = not np.allclose(zeros, A.T @ notcorrect2)
        ncor3 = not np.allclose(zeros, A.T @ notcorrect3)
        if not (cor1 and ncor1 and ncor2 and ncor3):
            doRepeat = True

    data["params"]["A"] = pl.to_json(A)

    data["params"]["correct"] = pl.to_json(correct.reshape(4, 1))
    data["params"]["notcorrect1"] = pl.to_json(notcorrect1.reshape(4, 1))
    data["params"]["notcorrect2"] = pl.to_json(notcorrect2.reshape(4, 1))
    data["params"]["notcorrect3"] = pl.to_json(notcorrect3.reshape(4, 1))
