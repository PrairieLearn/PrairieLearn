def generate(data):
    names_for_user = [
        {"name": "xi", "description": "initial guess", "type": "1D numpy array"},
        {
            "name": "tol",
            "description": "tolerance to be used in stopping criteria",
            "type": "float",
        },
    ]
    names_from_user = [
        {
            "name": "root",
            "description": "the root found with Newton's Method",
            "type": "1D numpy array",
        },
        {
            "name": "res",
            "description": "the residual, $\\| \mathbf{f}(x,y) \\|_2$ where x and y are the components of root",
            "type": "float",
        },
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
