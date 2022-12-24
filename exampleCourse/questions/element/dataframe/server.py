import numpy as np
import prairielearn as pl
import pandas as pd

def generate(data):
    df = pd.io.parsers.read_csv("breast-cancer-train.dat", header=None)

    df2 = pd.DataFrame(
        [
            {
                "city": "Champaign",
                "job": "Professor",
                "age": 35,
                "time": pd.to_datetime("2022-10-06 12:00"),
            },
            {
                "city": "Sunnyvale",
                "job": "Driver",
                "age": 20,
                "time": pd.to_datetime("2020-05-09 12:00"),
            },
            {
                "city": "Mountain View",
                "job": "Data Scientist",
                "age": np.nan,
                "time": pd.to_datetime("2021-12-14 12:00"),
            },
        ]
    )

    data["params"]["df"] = pl.to_json(df.head(15))
    data["params"]["df2"] = pl.to_json(df2, df_encoding_version=2)
    data["params"]["matrix"] = pl.to_json(np.random.random((3, 3)))

    return data
