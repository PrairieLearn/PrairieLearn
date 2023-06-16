def generate(data):
    names_for_user = [
        {
            "name": "r",
            "description": "so - called radius of the norm ball",
            "type": "float",
        },
    ]
    names_from_user = [
        {
            "name": "fig_1",
            "description": "plot in 1 norm",
            "type": "what plt.gca() returns",
        },
        {
            "name": "fig_2",
            "description": "plot in 2 norm",
            "type": "what plt.gca() returns",
        },
        {
            "name": "fig_3",
            "description": "plot in 5 norm",
            "type": "what plt.gca() returns",
        },
        {
            "name": "fig_4",
            "description": "plot in 0.5 norm",
            "type": "what plt.gca() returns",
        },
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user

    return data
