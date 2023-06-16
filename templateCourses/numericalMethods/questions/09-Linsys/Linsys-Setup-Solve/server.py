def generate(data):
    names_for_user = [
        {
            "name": "test_data",
            "description": "see problem statement",
            "type": "a dictionary containing lists of tuples",
        },
        {
            "name": "components",
            "description": "contains the names of the components",
            "type": "a list",
        },
    ]
    names_from_user = [
        {
            "name": "power_usage",
            "description": "contains the amount of energy per second used by the corresponding components",
            "type": "1D numpy array",
        }
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
