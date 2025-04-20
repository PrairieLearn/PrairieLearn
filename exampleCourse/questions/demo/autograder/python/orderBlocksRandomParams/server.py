import numpy as np


def generate(data):
    data["params"]["type"] = np.random.choice(["odd", "even"])

    a = np.random.choice([3, 5, 7])

    data["params"]["option1"] = "a = " + str(a)
    data["params"]["option2"] = "a = " + str(2 * a)
    data["params"]["option3"] = "a = " + str(2 * a + 1)
    data["params"]["option4"] = "a = " + str(4 * a)

    data["params"]["names_for_user"] = []
    data["params"]["names_from_user"] = [
        {
            "name": "return_number",
            "description": "returns specified number",
            "type": "Function",
        }
    ]
