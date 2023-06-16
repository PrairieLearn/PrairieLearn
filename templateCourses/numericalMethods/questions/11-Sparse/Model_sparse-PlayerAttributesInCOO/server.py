def generate(data):

    data["params"]["names_for_user"] = [
        {
            "name": "all_attributes",
            "description": "A list of attributes used to describe the players, sorted in the same order as "
            "they should appear in the columns of the COO matrix",
            "type": "List of strings",
        },
        {
            "name": "player_attributes",
            "description": "A list of player attributes, each represented as a dictionary shown above.",
            "type": "List of dictionaries",
        },
    ]
    data["params"]["names_from_user"] = [
        {
            "name": "data",
            "description": "The `data` array for COO matrix",
            "type": "List",
        },
        {
            "name": "row",
            "description": "The `row` array for COO matrix",
            "type": "List",
        },
        {
            "name": "col",
            "description": "The `col` array for COO matrix",
            "type": "List",
        },
    ]

    return data
