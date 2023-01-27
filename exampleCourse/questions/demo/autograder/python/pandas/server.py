import numpy as np
import pandas as pd
import prairielearn as pl


def generate(data):
    data["params"]["names_for_user"] = []
    data["params"]["names_from_user"] = [
        {
            "name": "df",
            "description": "dataframe as described above.",
            "type": "Pandas DataFrame",
        }
    ]
    data["params"]["df"] = pl.to_json(pd.DataFrame(data={"a": [1, 2], "b": [3, 4]}))
