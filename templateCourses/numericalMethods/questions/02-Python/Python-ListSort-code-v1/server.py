import random


def generate(data):

    order = random.choice(["ascending", "descending"])
    data["params"]["order"] = order

    description = "Sorts the argument input list (nums) in " + order + " order"

    names_for_user = []
    names_from_user = [
        {"name": "list_sort", "description": description, "type": "function"}
    ]

    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user

    return data
