import random
import problem_bank_helpers as pbh

def imports(data):
    import random
    import problem_bank_helpers as pbh
    
def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = 'Electrons Accelerating'
    data2["params"]["vars"]["units"] = "$m$"
    
    # Randomize Variables
    dist = random.randint(10,20)
    acc = random.randint(2,6)
    
    # store the variables in the dictionary "params"
    data2["params"]["dist"] = dist
    data2["params"]["acc"] = acc
    
    # define correct answers
    
    # Coeff is the value in which the randomized coefficient value for time is squared and then divided by the same value because of the formula 1/2at^2. Where the coefficient for time is the same value that acceleration is divided by.
    
    coeff = acc**2/acc
    ans = coeff*dist
    
    
    # define possible answers
    data2["params"]["part1"]["ans1"]["value"] = pbh.roundp(dist, sigfigs = 2)
    data2["params"]["part1"]["ans1"]["correct"] = False
    
    data2["params"]["part1"]["ans2"]["value"] = pbh.roundp(ans, sigfigs = 2)
    data2["params"]["part1"]["ans2"]["correct"] = True
    
    data2["params"]["part1"]["ans3"]["value"] = pbh.roundp(ans*acc, sigfigs = 2)
    data2["params"]["part1"]["ans3"]["correct"] = False
    
    data2["params"]["part1"]["ans4"]["value"] = pbh.roundp(dist/acc, sigfigs = 2)
    data2["params"]["part1"]["ans4"]["correct"] = False
    
    data2["params"]["part1"]["ans5"]["value"] = pbh.roundp(acc/dist, sigfigs = 2)
    data2["params"]["part1"]["ans5"]["correct"] = False
    
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    pass
    
