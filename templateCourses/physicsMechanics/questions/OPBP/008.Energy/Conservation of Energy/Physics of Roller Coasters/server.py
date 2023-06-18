import random as rd
import math
import problem_bank_helpers as pbh

def imports(data):
    import random as rd
    import math
    import problem_bank_helpers as pbh
    
def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = 'Physics of Roller-Coasters'
    data2["params"]["vars"]["units"] = "m/s"
    
    # Randomize Variables and round
    r = pbh.roundp(rd.uniform(10.0,30.0), sigfigs = 3)
    
    # store the variables in the dictionary "params"
    data2["params"]["r"] = r
    
    # define g
    g = 9.81
    
    # define possible answers
    data2["params"]["part1"]["ans1"]["value"] = pbh.roundp(math.sqrt(4*g*r), sigfigs = 3)
    data2["params"]["part1"]["ans1"]["correct"] = False
    
    data2["params"]["part1"]["ans2"]["value"] = pbh.roundp(math.sqrt(5*g*r), sigfigs = 3)
    data2["params"]["part1"]["ans2"]["correct"] = True
    
    data2["params"]["part1"]["ans3"]["value"] = pbh.roundp(math.sqrt(3*g*r), sigfigs = 3)
    data2["params"]["part1"]["ans3"]["correct"] = False
    
    data2["params"]["part1"]["ans4"]["value"] = pbh.roundp(math.sqrt(2*g*r), sigfigs = 3)
    data2["params"]["part1"]["ans4"]["correct"] = False
    
    data2["params"]["part1"]["ans5"]["value"] = pbh.roundp(math.sqrt(g*r), sigfigs = 3)
    data2["params"]["part1"]["ans5"]["correct"] = False
    
    data2["params"]["part1"]["ans6"]["value"] = pbh.roundp(math.sqrt(6*g*r), sigfigs = 3)
    data2["params"]["part1"]["ans6"]["correct"] = False
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    pass
    
