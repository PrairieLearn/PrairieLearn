import random
import pandas as pd
import problem_bank_helpers as pbh

def imports(data):
    import random
    import pandas as pd
    import problem_bank_helpers as pbh
    
def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = "Cars on Hills"
    data2["params"]["vars"]["units"] = "$\rm{\frac{m}{s^2}}$"
    
    # define bounds of the variables
    v = random.randint(10,30)
    r = random.randint(100,300)
    mu = random.randint(500,900)/100
    
    # store the variables in the dictionary "params"
    data2["params"]["v"] = v
    data2["params"]["r"] = r
    data2["params"]["mu"] = mu
    
    ## Part 1
    
    # define correct answers
    data2["correct_answers"]["part1_ans"] = pbh.roundp(-0.850*(9.8+(v**2/r)), sigfigs=3)
    
    ## Part 2
    
    # define correct answers
    data2["correct_answers"]["part2_ans"] = pbh.roundp(-0.850*(9.8-(v**2/r)), sigfigs = 3)
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    pass
    
