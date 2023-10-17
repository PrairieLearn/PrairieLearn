def generate(data):
    # Added to allow rubrics to reference moustache values, not used
    # in the actual question
    data["params"]["value1"] = 37
    data["params"]["value2"] = 43
    data["params"]["value3"] = 49
