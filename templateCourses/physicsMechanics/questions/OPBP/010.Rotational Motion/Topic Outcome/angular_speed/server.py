import random
import math
import pandas as pd
import problem_bank_helpers as pbh

def imports(data):
    import random
    import math
    import pandas as pd
    import problem_bank_helpers as pbh
    
def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = 'Angular Speed'
    data2["params"]["vars"]["units"] = "rad/s"
    
    # Randomize Variables
    rev = random.randint(2,15)
    
    # store the variables in the dictionary "params"
    data2["params"]["rev"] = rev
    
    # define possible answers
    data2["params"]["part1"]["ans1"]["value"] = pbh.roundp((2*math.pi)/rev, sigfigs = 2)
    data2["params"]["part1"]["ans1"]["correct"] = False
    
    data2["params"]["part1"]["ans2"]["value"] = pbh.roundp(rev*(math.pi), sigfigs = 2)
    data2["params"]["part1"]["ans2"]["correct"] = False
    
    data2["params"]["part1"]["ans3"]["value"] = pbh.roundp(rev*(2*math.pi), sigfigs = 2)
    data2["params"]["part1"]["ans3"]["correct"] = True
    
    data2["params"]["part1"]["ans4"]["value"] = pbh.roundp(rev/(2*math.pi), sigfigs = 2)
    data2["params"]["part1"]["ans4"]["correct"] = False
    
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    pass
    
