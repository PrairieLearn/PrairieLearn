import random, copy

def generate(data):

    # Sample two random integers between 5 and 10 (inclusive)
    a = random.randint(5, 10)
    b = random.randint(5, 10)

    # Put these two integers into data['params']
    data['params']['a'] = a
    data['params']['b'] = b

    # Compute the sum of these two integers
    c = a + b

    # Put the sum into data['correct_answers']
    data['correct_answers']['c'] = c

    data['params']['names_for_user'] = []
    data['params']['names_from_user'] = [
        {'name': 'fib', 'description': 'Function to compute the $n^\\text{th}$ fibonacci number', 'type': 'python function'}
    ]