import random, math

def generate(data):

    # Sample an integer number between 2 and 20
    a = random.randint(2, 20)
    data['params']['a'] = a

    # Sample an integer number between 6 and 11
    b = random.randint(6, 11)
    data['params']['b'] = b

    # Options for equations
    eq_options = [
        {'equation': '\\sqrt{(a^2 + b^2)}' , 'solution': math.sqrt(a**2 + b**2) },
        {'equation': 'a^2/b' , 'solution': a**2/b },
        {'equation': '2(b-a)^2' , 'solution': 2*(b-a)**2 },
        {'equation': '(a^2 + b^2)/a' , 'solution': (a**2 + b**2)/a},
        {'equation': '(a^2 + b^2)/b' , 'solution': (a**2 + b**2)/b}
    ]
    choice = random.choice(eq_options)
    
    # Put the resulta into data['params']
    data['correct_answers']['ans'] = choice['solution']
    data['params']['equation'] = choice['equation']
