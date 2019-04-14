import random

def generate(data):
    
    # Simulate values
    a = random.randint(2, 10)
    b = random.randint(2, 10)
    
    # Compute answer
    c = a + b
    
    # Release parameters
    data["params"]["a"] = a
    data["params"]["b"] = b
    
    # Release correct answer
    data["correct_answers"]["c_1"] = c
    data["correct_answers"]["c_2"] = c
    data["correct_answers"]["c_3"] = c
