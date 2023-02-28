import numpy as np
import pandas as pd
import prairielearn as pl


def generate(data):
    df = pd.read_csv("clientFilesQuestion/properties.csv")
    selected_columns = [
        "Designation",
        "Depth (in)",
        "Width (in)",
        "Moment of Inertia - Ix (in^4)",
        "Moment of Inertia - Iy (in^4)",
    ]

    m = len(df)
    pos1 = np.random.randint(0, m - 10)
    # note that in general, you will need to do a check if m > 10.
    # for simplicity, I am not doing any safety check because I know the length of my table is greater than 10
    pos2 = pos1 + 10
    df = df[selected_columns].iloc[pos1:pos2]

    data["params"]["df"] = pl.to_json(df)

    m = len(df)
    select = np.random.randint(0, m)

    name = df["Designation"].iloc[select]
    data["params"]["name"] = name

    Ix = df["Moment of Inertia - Ix (in^4)"].iloc[select]
    h = df["Depth (in)"].iloc[select]

    M = np.random.randint(2, 8)
    data["params"]["M"] = M

    sigma = M * (h / 2) / Ix

    data["correct_answers"]["sigma"] = sigma * 100
