def generate(data):
    names_for_user = [
        {
            "name": "r_init",
            "description": "Initial Guess",
            "type": "numpy array of shape (2,)",
        },
        {
            "name": "stop",
            "description": "Stopping condition tolerance",
            "type": "float",
        },
    ]
    names_from_user = [
        {
            "name": "r_newton",
            "description": "The result of Newton's Method",
            "type": "numpy array of shape (2,)",
        },
        {
            "name": "r_sd",
            "description": "The result of Steepest Descent",
            "type": "numpy array of shape (2,)",
        },
        {
            "name": "iteration_count_newton",
            "description": "The number of iterations that Newton's Method needs to find the minimum",
            "type": "integer",
        },
        {
            "name": "iteration_count_sd",
            "description": "The number of iterations that Steepest Descent needs to find the minimum",
            "type": "integer",
        },
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
