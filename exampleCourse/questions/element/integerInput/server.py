import random
import numpy

def generate(data):
    
    # Simulate values
    a = random.randint(2, 10)
    b = random.randint(2, 10)
    a16 = random.randint(0xA, 0x1F)
    b16 = random.randint(0xA, 0x1F)
    
    # Compute answer
    c = a + b
    c16 = a16 + b16
    
    # Release parameters
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["a16"] = f'{a16:X}'
    data["params"]["b16"] = f'{b16:X}'
    
    # Release correct answer
    data["correct_answers"]["c_1"] = c
    data["correct_answers"]["c_2"] = c
    data["correct_answers"]["c_3"] = c
    data["correct_answers"]["c_4"] = c
    data["correct_answers"]["c_5"] = c
    data["correct_answers"]["c_7"] = c16
