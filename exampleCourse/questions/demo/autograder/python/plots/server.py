import numpy as np
import prairielearn as pl
import json


def generate(data):
    data["params"]["names_for_user"] = []
    data["params"]["names_from_user"] = [
        {"name": "plot", "description": "The plot as described above.", "type": "matplotlib.axes instance"}
    ]
