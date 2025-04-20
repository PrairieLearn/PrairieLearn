import numpy as np
import prairielearn as pl


def parse(data):
    data["submitted_answers"] = {}


def generate(data):
    data["correct_answers"]["broken_5"] = pl.to_json(np.ones((2, 2)))
