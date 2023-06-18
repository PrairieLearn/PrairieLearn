import random as rd
import problem_bank_helpers as pbh

def imports(data):
    import random as rd
    import problem_bank_helpers as pbh
    
def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = 'The Energy Expenditure of a Jogger'
    data2["params"]["vars"]["units"] = "W"
    
    # Randomize Variables
    F = rd.randint(15,35)
    v = pbh.roundp(rd.uniform(3.0,8.0), sigfigs = 2)
    
    # store the variables in the dictionary "params"
    data2["params"]["F"] = F
    data2["params"]["v"] = v
    
    # define possible answers
    data2["params"]["part1"]["ans1"]["value"] = pbh.roundp(F*v*0.10,sigfigs = 2)
    data2["params"]["part1"]["ans1"]["correct"] = False
    
    data2["params"]["part1"]["ans2"]["value"] = pbh.roundp(F*v,sigfigs = 2)
    data2["params"]["part1"]["ans2"]["correct"] = True
    
    data2["params"]["part1"]["ans3"]["value"] = pbh.roundp(F*v*v,sigfigs = 2)
    data2["params"]["part1"]["ans3"]["correct"] = False
    
    data2["params"]["part1"]["ans4"]["value"] = pbh.roundp(2*F*v,sigfigs = 2)
    data2["params"]["part1"]["ans4"]["correct"] = False
    
    data2["params"]["part1"]["ans5"]["value"] = pbh.roundp(3*F*v,sigfigs = 2)
    data2["params"]["part1"]["ans5"]["correct"] = False
    
    data2["params"]["part1"]["ans6"]["value"] = pbh.roundp(0.5*F*v,sigfigs = 2)
    data2["params"]["part1"]["ans6"]["correct"] = False
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    pass
    
