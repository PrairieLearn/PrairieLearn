def generate(data):
    names_for_user = [
        {
            "name": "f",
            "description": "The function whose root you are looking for",
            "type": "f(x)",
        },
        {
            "name": "xks",
            "description": " The initial two guesses of the root",
            "type": "numpy array",
        },
    ]
    names_from_user = [
        {
            "name": "roots",
            "description": "The five root estimates you have found using the secant method",
            "type": "1D numpy array",
        }
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
