import numpy as np


def generate(data):
    # Define the variables here
    names_for_user = [
        {"name": "a", "description": "Any array", "type": "2d numpy array"}
    ]
    names_from_user = [
        {
            "name": "b",
            "description": "An array with the same shape as described above",
            "type": "2d numpy array",
        },
        {
            "name": "array_to_scalar",
            "description": "Function described in the text above",
            "type": "function",
        },
    ]

    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user

    data["params"]["beta"] = np.random.randint(2, 6)

    return data
