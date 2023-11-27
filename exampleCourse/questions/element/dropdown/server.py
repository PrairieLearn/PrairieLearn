def generate(data):
    data["params"]["question1"] = [
        {"tag": "true", "ans": "whole"},
        {"tag": "false", "ans": "part"},
        {"tag": "false", "ans": "inverse"},
    ]

    return data
