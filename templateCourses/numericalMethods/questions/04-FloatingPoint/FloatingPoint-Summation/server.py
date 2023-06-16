def generate(data):
    names_for_user = [
        {
            "name": "data",
            "description": "contains data to be summed",
            "type": "1D numpy array",
        }
    ]
    names_from_user = [
        {
            "name": "data_sum",
            "description": "sum of data with minimum error",
            "type": "float",
        }
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
