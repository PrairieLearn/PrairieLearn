import random
import math

def generate(data):
    
    # Simulate values
    a = random.randint(2, 10)
    b = random.randint(2, 10)
    
    # Compute answer
    c = math.sqrt(a^2 + b^2)
    
    # Release parameters
    data["params"]["a"] = a
    data["params"]["b"] = b
    
    # Release correct answer
    data["correct_answers"]["c"] = c
