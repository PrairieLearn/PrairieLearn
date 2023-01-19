import numpy as np
import prairielearn as pl
import pandas as pd


def generate(data):
    df = pd.io.parsers.read_csv("breast-cancer-train.dat", header=None)

    data["params"]["df"] = pl.to_json(df.head(15))
    data["params"]["matrix"] = pl.to_json(np.random.random((3, 3)))
    data["params"]["my_dictionary"] = {"a": 1, "b": 2, "c": 3}
    data["params"]["my_list"] = ["a", "b", "c"]

    data["params"]["another_list"] = [
        {'a': 1, 'aa': 1},
        {'b': 2, 'bb': 2},
        {'c': 3, 'cc': 3},
        {'d': 4, 'dd': 4}
    ]

    data["params"]["my_string"] = "a string"
