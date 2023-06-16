def generate(data):

    names_for_user = [
        {
            "name": "xs",
            "description": "random numbers from 0 to 1",
            "type": "1-d numpy array",
        },
        {
            "name": "ys",
            "description": "random numbers from 0 to 1",
            "type": "1-d numpy array",
        },
    ]

    names_from_user = [
        {
            "name": "calculate_pi",
            "description": "function accepting 2 arrays (x and y sample coordinates, respectively) and returning an estimate for $\pi$",
            "type": "function",
        },
        {
            "name": "pi",
            "description": "estimates for $\pi$ as described above",
            "type": "1-d numpy array",
        },
        {
            "name": "plot",
            "description": "log-log plot of absolute error vs. sample size",
            "type": "matplotlib Axes",
        },
    ]

    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user

    return data
