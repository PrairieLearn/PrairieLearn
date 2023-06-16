def generate(data):
    names_for_user = [
        {
            "name": "f",
            "description": "A unimodal function to minimize",
            "type": "func(float)",
        },
        {"name": "a", "description": "left end of starting bracket", "type": "float"},
        {"name": "b", "description": "right end of starting bracket", "type": "float"},
    ]
    names_from_user = [
        {"name": "a", "description": "left end of final bracket", "type": "float"},
        {"name": "b", "description": "right end of final bracket", "type": "float"},
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
