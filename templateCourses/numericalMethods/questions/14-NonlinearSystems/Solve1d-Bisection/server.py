def generate(data):
    names_for_user = [
        {
            "name": "function",
            "description": "the function for which a zero is to be found",
            "type": "function(x)",
        },
        {
            "name": "intervals",
            "description": "a list of intervals",
            "type": "list of tuples (a,b)",
        },
        {"name": "epsilon", "description": "the tolerance", "type": "float"},
        {
            "name": "n_iter",
            "description": "the maximum number of iterations",
            "type": "integer",
        },
    ]
    names_from_user = [
        {
            "name": "roots",
            "description": "a list with one root for each interval, or the value None if an error was encountered",
            "type": "Python List",
        }
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
