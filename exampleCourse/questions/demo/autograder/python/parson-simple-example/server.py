import numpy as np


def generate(data):
    data["params"]["names_for_user"] = []
    data["params"]["names_from_user"] = [
        {"name": "make_array_b", "description": "The new created array", "type": "array"}
    ]
