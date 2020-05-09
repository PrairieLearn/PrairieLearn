def generate(data):
    names_for_user = []
    names_from_user = [
        {'name': 'fib', 'description': 'Function to compute the $n^\\text{th}$ Fibonacci number', 'type': 'python function'}
    ]

    data['params']['names_for_user'] = names_for_user
    data['params']['names_from_user'] = names_from_user

    return data
