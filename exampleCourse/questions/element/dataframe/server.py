import numpy as np
import pandas as pd
import prairielearn as pl


def generate(data):
    df = pd.read_csv("breast-cancer-train.dat", header=None)

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

    dft = pd.DataFrame(
        {
            # Scalars
            "integer": 1,
            "numeric": 3.14,
            "logical": False,
            "character": "foo",
            # Series
            "numeric-list": pd.Series([1.0] * 3).astype("float32"),
            "integer-list": pd.Series([1] * 3, dtype="int8"),
            "character-list": pd.Series(["hello", "world", "stat"]),
            "logical-list": pd.Series([True, False, True]),
            "character-string-list": pd.Series(["a", "b", "c"], dtype="string"),
            # Time Dependency: https://pandas.pydata.org/docs/user_guide/timeseries.html
            "POSIXct-POSIXt-timestamp": pd.Timestamp("20230102"),
            "POSIXct-POSIXt-date_range": pd.date_range("2023", freq="D", periods=3),
            # Categorical: https://pandas.pydata.org/docs/user_guide/categorical.html
            "factor": pd.Categorical(["a", "b", "c"], ordered=False),
            "ordered-factor": pd.Categorical(
                ["a", "b", "c"], categories=["a", "b", "c"], ordered=True
            ),
        }
    )

    data["params"]["df"] = pl.to_json(df.head(15))
    data["params"]["df2"] = pl.to_json(df2, df_encoding_version=2)
    data["params"]["dft"] = pl.to_json(dft, df_encoding_version=2)
