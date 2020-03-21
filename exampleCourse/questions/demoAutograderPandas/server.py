import numpy as np
import prairielearn as pl
import pandas as pd


def generate(data):

    # Define the variables here
    names_for_user = []
    names_from_user = [
        {"name": "df", "description": "dataframe as described above.", "type": "Pandas DataFrame"}
    ]

    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user

    df = pd.DataFrame(data={'a': [1, 2], 'b': [3, 4]})
    data['params']['df'] = pl.to_json(df)
    
    return data
