import numpy as np
import prairielearn as pl


def generate(data):
    perc = np.random.choice([0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95])
    rd = np.random.choice([1, 2, 3])
    if rd == 1:
        M = np.array(
            [
                [0.7, 0.0, 0.0, 0.0],
                [0.1, 0.5, 0.1, 0.0],
                [0.1, 0.4, 0.8, 0.0],
                [0.1, 0.1, 0.1, 1.0],
            ]
        )
    elif rd == 2:
        M = np.array(
            [
                [0.8, 0.0, 0.0, 0.0],
                [0.1, 0.6, 0.2, 0.0],
                [0.05, 0.2, 0.7, 0.0],
                [0.05, 0.2, 0.1, 1.0],
            ]
        )
    elif rd == 3:
        M = np.array(
            [
                [0.6, 0.0, 0.0, 0.0],
                [0.2, 0.4, 0.4, 0.0],
                [0.1, 0.3, 0.5, 0.0],
                [0.1, 0.3, 0.1, 1.0],
            ]
        )

    M_perc = M * 100

    data["params"]["perc"] = perc * 100
    data["params"]["exa_1"] = M_perc[1][0]
    data["params"]["exa_2"] = M_perc[2][0]
    data["params"]["exa_3"] = M_perc[3][0]
    data["params"]["A_1"] = M_perc[2][1]
    data["params"]["A_2"] = M_perc[3][1]
    data["params"]["B_1"] = M_perc[1][2]
    data["params"]["B_2"] = M_perc[3][2]

    data["params"]["m"] = pl.to_json(M)

    names_for_user = []
    names_from_user = [
        {
            "name": "M",
            "description": "the transition matrix representing the Markov chain.",
            "type": "2d numpy array",
        },
        {
            "name": "hours",
            "description": "the number of hours needed to excrete {0}% of the dose".format(
                int(perc * 100)
            ),
            "type": "positive integer",
        },
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user

    return data
