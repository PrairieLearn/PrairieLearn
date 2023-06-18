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
    data2["params"]["vars"]["title"] = "Kinetic Energy of a Simple Pendulum System"
    data2["params"]["vars"]["units"] = "degrees"
    
    # define bounds of the variables
    theta = pbh.roundp(rd.uniform(10.00,90.0), sigfigs = 3)
    
    # store the variables in the dictionary "params"
    data2["params"]["theta"] = theta
    
    # calculate cos(theta)
    # E = mgl(1-cos(theta)). We only need to calculate (1-cos(theta))
    E = (1-math.cos(math.radians(theta)))
    
    # define correct answer
    # only store the absolute value
    ans1 = math.acos(1-E/2)
    data2["correct_answers"]["part1_ans"] = math.degrees(ans1)
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    pass
    
