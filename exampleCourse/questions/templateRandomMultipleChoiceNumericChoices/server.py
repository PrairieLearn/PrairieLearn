import random

def generate(data):

    # Sample a random decimal number in the hundreths place between 0.1 and 5
    a = round(random.uniform(0.1, 5), 2)

    # Sample a random decimal number in the hundreths place between 5.1 and 10
    b = round(random.uniform(5.1, 10), 2)

    # Put these two decimal numbers into data['params']
    data['params']['a'] = a
    data['params']['b'] = b

    # Compute the product of these two numbers
    c = a * b

    # Put the product into data['params']
    data['params']['correct_answer'] = c
    
    # Generate four distractors by changing the operation
    data['params']['wrong_answer1'] = a * b + .05
    data['params']['wrong_answer2'] = a / b
    data['params']['wrong_answer3'] = b - a
    data['params']['wrong_answer4'] = a + b
