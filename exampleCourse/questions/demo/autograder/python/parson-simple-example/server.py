import numpy as np


def generate(data):
    data["params"]["names_for_user"] = [
        {"name": "a", "description": "The original array", "type": "array"}
    ]
    data["params"]["names_from_user"] = [
        {"name": "b", "description": "The new created array", "type": "array"}
    ]
