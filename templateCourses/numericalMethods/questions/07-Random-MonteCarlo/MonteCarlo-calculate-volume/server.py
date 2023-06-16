def generate(data):

    names_for_user = []

    names_from_user = [
        {
            "name": "insideCylinders",
            "description": "Function that determines if a point is inside the given solid.",
            "type": "function",
        },
        {
            "name": "prob_inside_volume",
            "description": "Function that approximates the probability that N points are inside the given solid.",
            "type": "function",
        },
        {
            "name": "volume_approx",
            "description": "Approximation to the volume.",
            "type": "number",
        },
    ]

    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user

    return data
