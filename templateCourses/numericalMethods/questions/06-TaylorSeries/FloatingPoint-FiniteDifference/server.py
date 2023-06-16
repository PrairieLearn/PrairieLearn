def generate(data):

    names_for_user = [
        {"name": "xvec", "description": "vector x", "type": "1d numpy array"},
        {
            "name": "dxvec",
            "description": "contains decreasing values for the perturbation ",
            "type": "1d numpy array",
        },
    ]
    names_from_user = [
        {
            "name": "func",
            "description": "generate value of the function f",
            "type": "function",
        },
        {
            "name": "fd",
            "description": "approximate the gradient of the function f",
            "type": "function",
        },
        {
            "name": "dfunc",
            "description": "evaluate the analytical expression for the gradient of the function f",
            "type": "function",
        },
        {
            "name": "error",
            "description": "error due to finite difference approximation",
            "type": "1d numpy array",
        },
    ]

    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
