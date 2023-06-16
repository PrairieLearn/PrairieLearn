def generate(data):

    names_for_user = [
        {
            "name": "U",
            "description": "matrix ${\\bf U}$ in ${\\bf A}={\\bf U\\Sigma V}^T$",
            "type": "2d numpy array of shape (m,n)",
        },
        {
            "name": "sigma",
            "description": "matrix ${\\bf \\Sigma}$ in ${\\bf A}={\\bf U\\Sigma V}^T$",
            "type": "2d numpy array of shape (n,n)",
        },
        {
            "name": "V",
            "description": "matrix ${\\bf V}$ in ${\\bf A}={\\bf U\\Sigma V}^T$",
            "type": "2d numpy array of shape (n,n)",
        },
        {
            "name": "k",
            "description": "desired rank of the low-rank approximation to ${\\bf A}$",
            "type": "positive integer",
        },
    ]
    names_from_user = [
        {
            "name": "A_k",
            "description": "the best rank-${k}$ approximation of the matrix ${\\bf A}$",
            "type": "2d numpy array of shape (m,n)",
        }
    ]

    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user

    return data
