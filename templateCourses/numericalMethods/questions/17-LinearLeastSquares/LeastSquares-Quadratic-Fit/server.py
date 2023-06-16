def generate(data):
    names_for_user = [
        {"name": "year", "description": "array of the years", "type": "1d numpy array"},
        {
            "name": "percent",
            "description": "array of the percentages",
            "type": "1d numpy array",
        },
    ]
    names_from_user = [
        {
            "name": "c0",
            "description": "coefficient 0 of the parabola",
            "type": "floating point",
        },
        {
            "name": "c1",
            "description": "coefficient 1 of the parabola",
            "type": "floating point",
        },
        {
            "name": "c2",
            "description": "coefficient 2 of the parabola",
            "type": "floating point",
        },
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
