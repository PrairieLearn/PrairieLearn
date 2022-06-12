import random
import pandas as pd
import prairielearn as pl
import numpy as np

def generate(data):

    mu_o = random.choice([19.7,19.8,19.9,20,20.1,20.2])
    std_gen = random.choice([1.3, 1.4, 1.5])
    sample_size = random.randint(8,11)
    # dataset
    sample_data =  np.round(np.random.normal(mu_o, std_gen, sample_size),1)

    # providing the dataset as pandas frame
    df = pd.DataFrame(data = sample_data)
    df.columns = ['Volume (oz)']
    data['params']['df'] = pl.to_json(df)

    # computing the correct answer
    data['correct_answers']['average'] = sample_data.mean()
