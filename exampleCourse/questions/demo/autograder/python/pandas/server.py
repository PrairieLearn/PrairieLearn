import pandas as pd
import prairielearn as pl


def generate(data):
    data["params"]["df"] = pl.to_json(pd.DataFrame(data={"a": [1, 2], "b": [3, 4]}))
