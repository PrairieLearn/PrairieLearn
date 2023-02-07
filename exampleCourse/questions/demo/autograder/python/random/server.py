def generate(data):
    data["params"]["names_for_user"] = []
    data["params"]["names_from_user"] = [
        {
            "name": "area",
            "description": "Approximate area of the circle.",
            "type": "Number",
        }
    ]
