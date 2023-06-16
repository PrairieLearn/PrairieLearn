import numpy as np


def generate(data):
    # np.set_printoptions(precision=1)
    cond = np.random.choice([1000, 2000])
    e_deg = np.random.randint(3, 6)
    norm = np.random.randint(3, 7)

    if np.random.choice([True, False]):
        information = ""
        data["params"][
            "correct"
        ] = "We cannot compute a bound estimate with the information provided."
        data["params"]["wrong3"] = cond * norm / (10 ** (e_deg))

    else:
        information = "the norm $\\|\\mathbf{y}\\|=" + str(norm) + "$."
        data["params"]["correct"] = cond * norm / (10 ** (e_deg))
        data["params"][
            "wrong3"
        ] = "We cannot compute a bound estimate with the information provided."

    data["params"]["cond"] = int(cond)
    data["params"]["e_deg"] = e_deg
    data["params"]["norm"] = norm
    data["params"]["information"] = information
    data["params"]["wrong1"] = cond / (10 ** (e_deg - 1))
    data["params"]["wrong2"] = str(e_deg) + " digits of accuracy"

    return data
