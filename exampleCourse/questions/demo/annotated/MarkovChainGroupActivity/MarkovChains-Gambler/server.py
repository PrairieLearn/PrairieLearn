def generate(data):
    data["params"]["names_from_user"] = [
        {"name": "G", "description": r"markov matrix G", "type": r"2d numpy array"},
        {"name": "xstar2", "description": r"probability of winning and losing", "type": r"1d numpy array"}
    ]
    data["params"]["names_for_user"] = [
    ]
