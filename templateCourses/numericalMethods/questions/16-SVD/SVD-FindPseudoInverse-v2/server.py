def generate(data):

    names_for_user = [
        {
            "name": "U",
            "description": "matrix ${\\bf U}$ in ${\\bf A}={\\bf U\\Sigma V}^T$",
            "type": "2d numpy array",
        },
        {
            "name": "sigmavec",
            "description": "1d array of non-zero singular values of ${\\bf \\Sigma}$ in ${\\bf A}={\\bf U\\Sigma V}^T$",
            "type": "1d numpy array",
        },
        {
            "name": "V",
            "description": "matrix ${\\bf V}$ in ${\\bf A}={\\bf U\\Sigma V}^T$",
            "type": "2d numpy array",
        },
    ]
    names_from_user = [
        {
            "name": "A_plus",
            "description": "the pseudo-inverse of the matrix ${\\bf A}$",
            "type": "2d numpy array",
        }
    ]

    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user

    return data
