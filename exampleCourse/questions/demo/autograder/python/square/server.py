import numpy as np


def generate(data):
    data["params"]["names_for_user"] = [
        {"name": "x", "description": "The number that needs to be squared", "type": "float"}
    ]
    data["params"]["names_from_user"] = [
        {"name": "x_sq", "description": "The square of $x$", "type": "float"}
    ]
