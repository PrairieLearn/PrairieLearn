import math
import random


def generate(data):
    # Sample an integer number between 2 and 20.
    a = random.randint(2, 20)
    data["params"]["a"] = a

    # Sample an integer number between 6 and 11.
    b = random.randint(6, 11)
    data["params"]["b"] = b

    # Define a list of equations and their solutions.
    equation_options = [
        ("\\sqrt{(a^2 + b^2)}", math.sqrt(a**2 + b**2)),
        ("a^2/b", a**2 / b),
        ("2(b-a)^2", 2 * (b - a) ** 2),
        ("(a^2 + b^2)/a", (a**2 + b**2) / a),
        ("(a^2 + b^2)/b", (a**2 + b**2) / b),
    ]

    # Select a random equation and its solution.
    selected_equation, selected_solution = random.choice(equation_options)

    # Store the equation and the correct answer.
    data["params"]["equation"] = selected_equation
    data["correct_answers"]["value"] = selected_solution
