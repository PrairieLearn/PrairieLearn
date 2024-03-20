import numpy as np
import pandas as pd


def generate(data):
    df = pd.read_csv("clientFilesQuestion/properties.csv")

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
