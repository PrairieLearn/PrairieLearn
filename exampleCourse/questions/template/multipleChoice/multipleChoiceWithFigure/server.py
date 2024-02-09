import random


def generate(data):
    # Create a list with the file name of UIUC figures.
    uiuc_figures = [
        "fig1.jpeg",
        "fig2.jpeg",
        "fig3.jpeg",
        "fig4.jpeg",
        "fig5.jpeg",
        "fig6.jpeg",
        "fig7.jpeg",
    ]

    # Shuffle the order of the UIUC figures.
    random.shuffle(uiuc_figures)

    # Store the first three shuffled UIUC figures as the wrong answers.
    data["params"]["wrong_filename0"] = uiuc_figures[0]
    data["params"]["wrong_filename1"] = uiuc_figures[1]
    data["params"]["wrong_filename2"] = uiuc_figures[2]

    # Create a list with the file name of non-UIUC figures.
    non_uiuc_figures = ["b1.jpeg", "b2.jpeg", "b3.jpeg", "b4.jpeg"]

    # Make a random selection for the non-UIUC figure as the correct answer.
    data["params"]["correct_filename"] = random.choice(non_uiuc_figures)
