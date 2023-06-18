import random
import pandas as pd
import math
import problem_bank_helpers as pbh

def imports(data):
    import random
    import pandas as pd
    import math
    import problem_bank_helpers as pbh
    
def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = "Rock on a String"
    data2["params"]["vars"]["units"] = "m/s"
    
    # Randomize Variables
    m = random.randint(1,5)*0.25
    r = random.randint(20,90)
    T = random.randint(1,5)*100
    
    # store the variables in the dictionary "params"
    data2["params"]["m"] = m
    data2["params"]["r"] = r
    data2["params"]["T"] = T
    
    # define possible answers
    data2["params"]["part1"]["ans1"]["value"] = pbh.roundp(math.sqrt((r/100)*T/m), decimals=0)
    data2["params"]["part1"]["ans1"]["correct"] = True
    
    data2["params"]["part1"]["ans2"]["value"] = pbh.roundp(math.sqrt((r/100)*T/m)-10, decimals=0)
    data2["params"]["part1"]["ans2"]["correct"] = False
    
    data2["params"]["part1"]["ans3"]["value"] = pbh.roundp(math.sqrt(((r/100)/2)*T/m)+10, decimals=0)
    data2["params"]["part1"]["ans3"]["correct"] = False
    
    data2["params"]["part1"]["ans4"]["value"] = pbh.roundp(math.sqrt((r/100)*T/m)-20, decimals=0)
    data2["params"]["part1"]["ans4"]["correct"] = False
    
    data2["params"]["part1"]["ans5"]["value"] = pbh.roundp(math.sqrt((r/100)*T/m)+20, decimals=0)
    data2["params"]["part1"]["ans5"]["correct"] = False
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    pass
    
