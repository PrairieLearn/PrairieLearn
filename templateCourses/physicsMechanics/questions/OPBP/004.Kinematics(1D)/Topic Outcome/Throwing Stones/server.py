import random as rd
import pandas as pd
import problem_bank_helpers as pbh

def imports(data):
    import random as rd
    import pandas as pd
    import problem_bank_helpers as pbh
    
def generate(data):
    data2 = pbh.create_data2()
    
    # define or load names/items/objects
    names = pbh.names.copy()
    
    # store phrases etc
    data2["params"]["vars"]["name"] = rd.choice(names)
    data2["params"]["vars"]["title"] = "Throwing Stones"
    data2["params"]["vars"]["units"] = "$s$"
    
    # define bounds of the variables
    v = pbh.roundp(rd.uniform(10.0,30.0), sigfigs = 3)
    
    # store the variables in the dictionary "params"
    data2["params"]["v"] = v
    
    # define g
    g = 9.81
    
    # define correct answers
    data2["correct_answers"]["part1_ans"] = (2*v)/g
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    pass
    
