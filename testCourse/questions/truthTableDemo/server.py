def generate(data):
    variables = [{"name": "A"}, {"name": "B"}, {"name": "C"}, {"name": "D"}]

    rows = []

    rows.append({"C": 0, "D": 1})

    data["params"]["variables"] = variables
    data["params"]["rows"] = rows
    data["params"]["expression"] = "A or B"
