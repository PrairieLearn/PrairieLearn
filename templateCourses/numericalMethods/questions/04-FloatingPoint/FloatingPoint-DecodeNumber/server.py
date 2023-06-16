def generate(data):
    names_for_user = [
        {
            "name": "minifloats",
            "description": "list of minifloat floating point numbers",
            "type": "list",
        }
    ]
    names_from_user = [
        {
            "name": "outputs",
            "description": "list of decoded floating point numbers",
            "type": "list",
        }
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
