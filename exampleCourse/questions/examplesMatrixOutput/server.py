import random
import math

def generate(data):
    
    # Simulate values
    a = random.randint(2, 10)
    b = random.randint(2, 10)
    
    # Compute answer
    c = math.sqrt(a**2 + b**2)
    
    # Release parameters
    data["params"]["a"] = a
    data["params"]["b"] = b
    
    # Release correct answer
    data["correct_answers"]["c_1"] = c
    data["correct_answers"]["c_2"] = c
    data["correct_answers"]["c_3"] = c
    data["correct_answers"]["c_4"] = c
    data["correct_answers"]["c_5"] = c
    data["correct_answers"]["c_m"] = 2
    data["correct_answers"]["c_b"] = 5
