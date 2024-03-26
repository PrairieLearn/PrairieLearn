import random


def generate(data):
    # Define a list of irregular singular words and their plural forms.
    words = {
        "mouse": "mice",
        "goose": "geese",
        "child": "children",
        "tooth": "teeth",
        "woman": "women",
        "man": "men",
        "foot": "feet",
        "person": "people",
        "leaf": "leaves",
        "cactus": "cacti",
    }

    # Select a random singular word from the list.
    singular_word = random.choice(list(words.keys()))

    # Store the singular word and its corresponding plural form.
    data["params"]["singular_word"] = singular_word
    data["correct_answers"]["plural_word"] = words[singular_word]
