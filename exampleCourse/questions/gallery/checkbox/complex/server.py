import random

def generate(data):

    # List of animals in each group
    # More animals can be added here for increased variation
    animals = {"mammal": ["Bear", "Monkey", "Dog", "Cheetah", "Koala", "Zebra"],
                "bird": ["Dove", "Chicken", "Duck", "Sparrow", "Crow", "Eagle"],
                "fish": ["Salmon", "Tilapia", "Tuna", "Yellowtail", "Carp", "Cod"],
                "reptile": ["Lizard", "Snake", "Turtle", "Crocodile", "Gecko", "Chameleon"]}

    # List with all the groups
    all_groups = list(animals.keys())

    # Select one of the groups as the correct answer
    group  = random.choice(all_groups)
    data["params"]["group"] = group

    # List containing the remaining groups (incorrect answer)
    remaining_groups = all_groups.copy()
    remaining_groups.remove(group)

    # Get "n" animals from the "true" group
    n = random.choice([2,3])
    true_ans = random.sample(animals[group], n)

    # Storing the correct answers in the data dictionary
    for i in range(n):
        data["params"]["text"+str(i)] = true_ans[i]
        data["params"]["ans"+str(i)] = "true"

    # Get "6-n" from the "false" group
    all_remaining_animals = []
    for g in remaining_groups:
        all_remaining_animals += animals[g]
    false_ans = random.sample(all_remaining_animals, 6-n)

    # Storing the incorrect answers in the data dictionary
    for i in range(6-n):
        data["params"]["text"+str(n+i)] = false_ans[i]
        data["params"]["ans"+str(n+i)] = "false"

    return
