import random

def generate(data):

    # Sample a non-zero complex number
    while True:
        x = round(random.uniform(-10,10),2)
        y = round(random.uniform(-10,10),2)
        if (x != 0) or (y != 0):
            break
    z = complex(x,y)

    # Compute its magnitude a.k.a. modulus a.k.a. absolute value
    zmag = abs(z)

    # Add result to params and correct_answers
    data["params"]["z"] = z
    data["correct_answers"]["zmag"] = zmag
    
    return data
