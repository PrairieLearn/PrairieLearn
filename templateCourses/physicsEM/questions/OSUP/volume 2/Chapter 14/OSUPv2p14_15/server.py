from collections import defaultdict

nested_dict = lambda: defaultdict(nested_dict)


def generate(data):
    # Start problem code
    data2 = nested_dict()

    # store phrases etc
    data2["params"]["vars"]["title"] = "RL Series Circuit: Time"

    # define possible answers
    data2["params"]["part1"]["ans1"][
        "value"
    ] = "Immediately when switch $\\rm S$ is first thrown."
    data2["params"]["part1"]["ans1"]["correct"] = True

    data2["params"]["part1"]["ans2"][
        "value"
    ] = "After an infinitely long period of time."
    data2["params"]["part1"]["ans2"]["correct"] = False

    data2["params"]["part1"]["ans3"]["value"] = "After one time constant."
    data2["params"]["part1"]["ans3"]["correct"] = False

    data2["params"]["part1"]["ans4"]["value"] = "After two time constants."
    data2["params"]["part1"]["ans4"]["correct"] = False

    # Update the data object with a new dict
    data.update(data2)
