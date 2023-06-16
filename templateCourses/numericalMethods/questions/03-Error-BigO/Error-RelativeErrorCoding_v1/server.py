def generate(data):
    names_for_user = [
        {
            "name": "f_hat",
            "description": "a function which has the same effect as the f_p72 instruction",
            "type": "function",
        },
        {
            "name": "x",
            "description": "a floating point number",
            "type": "floating point number",
        },
    ]
    names_from_user = [
        {
            "name": "relative_error",
            "description": "the relative error in approximating $x^{0.72}$ using f_hat",
            "type": "floating point number",
        }
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
