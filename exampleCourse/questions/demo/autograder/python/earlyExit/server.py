def generate(data):
    data["params"]["names_for_user"] = [
        {"name": "x", "description": r"$x$", "type": "floating point number"},
    ]
    data["params"]["names_from_user"] = [
        {"name": "y", "description": r"$y=x^2$","type": "floating point number"},
        {"name": "z", "description": r"$z=\sqrt{y+1}$","type": "floating point number"},
    ]
