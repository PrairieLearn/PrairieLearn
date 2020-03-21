import numpy as np


def generate(data):

    # Define the variables here
    names_for_user = [
        {"name": "x", "description": "Description of the variable", "type": "float"}
    ]
    names_from_user = [
        {"name": "x_sq",
            "description": "The square of $x$", "type": "float"}
    ]

    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user

    return data
