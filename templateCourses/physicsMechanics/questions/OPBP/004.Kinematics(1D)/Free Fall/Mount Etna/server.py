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
    data2["params"]["vars"]["title"] = "Eruption of Mount Etna"
    data2["params"]["vars"]["units"] = "$km/h$"
    
    # define bounds of the variables
    h = pbh.roundp( rd.uniform(80.0, 120.0), sigfigs = 3)
    
    # store the variables in the dictionary "params"
    data2["params"]["h"] = h
    
    # define g
    g = 9.81
    
    # calculate answer in m/s
    v_iy = math.sqrt(2*g*h)
    
    # define correct answer in km/h
    data2["correct_answers"]["part1_ans"] = v_iy * 3.6
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    pass
    
