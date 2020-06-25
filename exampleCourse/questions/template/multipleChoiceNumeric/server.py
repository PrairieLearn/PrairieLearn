import random

def generate(data):

    # Sample a random decimal number in the tenths place between 1.1 and 5
    a = round(random.uniform(1.1, 5), 1)

    # Sample an integer number between 6 and 11
    b = random.randint(6, 11)

    # Put these two decimal numbers into data['params']
    data['params']['a'] = a
    data['params']['b'] = b

    # Compute the product of these two numbers
    c = a * b

    # Put the product into data['params']
    data['params']['correct_answer'] = c
    
    # Generate three distractors by changing the operation
    data['params']['wrong_answer1'] = (a - 1) * b
    data['params']['wrong_answer2'] = b - a
    data['params']['wrong_answer3'] = (a + 1) * b
