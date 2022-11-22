import prairielearn as pl
import numpy as np

def parse(data):
    data['submitted_answers'] = {}

def generate(data):
    data['correct_answers']['broken_5'] = pl.to_json(np.ones((2, 2)))
