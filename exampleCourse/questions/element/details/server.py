import pandas as pd
import prairielearn as pl


def generate(data: pl.QuestionData) -> None:
    # Generate a DataFrame with some sample data
    df = pd.read_csv("breast-cancer-train-trim.csv")

    # Add the DataFrame to the question data
    data["params"]["df"] = pl.to_json(df)
