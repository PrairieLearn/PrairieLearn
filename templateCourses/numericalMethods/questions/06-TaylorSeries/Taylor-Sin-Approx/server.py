def generate(data):
    names_for_user = []
    names_from_user = [
        {
            "name": "err_0_1",
            "description": "error when x_0 = 0 and n=1",
            "type": "floating point number",
        },
        {
            "name": "err_0_3",
            "description": "error when x_0 = 0 and n=3",
            "type": "floating point number",
        },
        {
            "name": "err_pi4_3",
            "description": "error when x_0 = pi/4 and n=3",
            "type": "floating point number",
        },
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
