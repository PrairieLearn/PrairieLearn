
def generate(data):
    data["params"]["names_for_user"] = [
        {"name": "a", "description": "The input array", "type": "array"}
    ]
    data["params"]["names_from_user"] = [
        {"name": "make_array_b", "description": "The user-defined function", "type": "function"}
    ]
