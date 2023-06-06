import random

WORD_CHOICES = (
    "knight",
    "duck",
    "herring",
    "hamster",
    "spam",
    "quest",
    "ministry",
    "grail",
    "silly",
    "parrot",
)
FUN_CHOICES = ("foo", "bar", "baz", "quux")


def generate(data):
    reordered_words = list(WORD_CHOICES)
    random.shuffle(reordered_words)

    # Select some input words, output words, a missing word to use for testing, and default output.
    input_words = reordered_words[:4]
    output_words = reordered_words[4:8]
    missing_word = reordered_words[8]
    default_output = reordered_words[9]

    # Build the list of input/output pairs.
    data["params"]["pairs"] = [
        {
            "input": input,
            "output": output,
        }
        for (input, output) in zip(input_words, output_words)
    ]

    # Pick the function name
    function_name = random.choice(FUN_CHOICES)

    data["params"]["names_for_user"] = []
    data["params"]["names_from_user"] = [
        {
            "name": function_name,
            "description": "the requested function",
            "type": "function (str -> str)",
        }
    ]

    data["params"]["function_name"] = function_name
    data["params"]["default_output"] = default_output
    data["params"]["invalid_input"] = missing_word
