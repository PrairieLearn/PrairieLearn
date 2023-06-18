import random as rd
import numpy as np
import pandas as pd
import math
import problem_bank_helpers as pbh

def imports(data):
    import random as rd
    import numpy as np
    import pandas as pd
    import math
    import problem_bank_helpers as pbh
    
def generate(data):
    # Start problem code
    data2 = pbh.create_data2()
    
    # define or load names/items/objects from server files
    names = pbh.names.copy()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = "A Frictionless Air Track?"
    data2["params"]["vars"]["name"] = rd.choice(names)
    data2["params"]["vars"]["units"] = "$m/s^2$"
    
    # define bounds of the variables
    m1 = pbh.roundp( rd.uniform(100.0, 500.0) , sigfigs = 4)
    m2 = pbh.roundp( rd.uniform(10.0, 80.0) , sigfigs = 4)
    d_a = pbh.roundp( rd.uniform(0.01, 0.03) , sigfigs = 1) # uncertainty in acceleration
    
    # store the variables in the dictionary "params"
    data2["params"]["m1"] = m1
    data2["params"]["m2"] = m2
    data2["params"]["d_a"] = d_a
    
    # define g
    g = 9.81
    
    # generate the table
    a_meas = [pbh.roundp(rd.uniform(1.3,1.8), sigfigs=3) for _ in range(10)]
    
    # calculate mean measured acceleration and standard deviation
    mean = pbh.roundp(float(np.mean(a_meas)), sigfigs=3)
    sd = pbh.roundp(float(np.std(a_meas)), sigfigs = 3)
    
    # save table values in dictionary
    data2["params"]["mean"] = mean
    data2["params"]["sd"] = sd
    
    values = ["a{0}".format(i+1) for i in range(10)]
    for x in a_meas:
      value = values.pop(0)
      data2["params"][value] = x
    
    ## Part 1
    
    # define correct answer, a_expected
    a_exp = pbh.roundp((m2/(m1+m2))*g, sigfigs = 4)
    data2["correct_answers"]["part1_ans"] = a_exp
    
    ## Part 2
    
    # define correct answer
    data2["correct_answers"]["part2_ans"] = mean
    
    ## Part 3
    
    # define correct answer
    error = pbh.roundp(sd/(math.sqrt(10)), sigfigs = 4)
    data2["correct_answers"]["part3_ans"] = error
    
    ## Part 4. Define correct answer depending on whether the results are within error or not
    
    # Find whether the results are within error.
    # high and low are the endpoints of the confidence interval.
    low = mean - error
    high = mean + error
    
    # define possible answers
    data2["params"]["part4"]["ans1"]["value"] = "The track is frictionless because $a_{expected}$ does not agree with $a_{measured}$."
    data2["params"]["part4"]["ans1"]["correct"] = False
    
    data2["params"]["part4"]["ans2"]["value"] = "The track is not frictionless because $a_{expected}$ agrees with $a_{measured}$."
    data2["params"]["part4"]["ans2"]["correct"] = False
    
    if (a_exp > low ) and (a_exp < high):
        data2["params"]["part4"]["ans3"]["value"] = "The track is not frictionless because $a_{expected}$ does not agree with $a_{measured}$."
        data2["params"]["part4"]["ans3"]["correct"] = False
    
        data2["params"]["part4"]["ans4"]["value"] = "The track is frictionless because $a_{expected}$ agrees with $a_{measured}$."
        data2["params"]["part4"]["ans4"]["correct"] = True
    else:
        data2["params"]["part4"]["ans3"]["value"] = "The track is not frictionless because $a_{expected}$ does not agree with $a_{measured}$."
        data2["params"]["part4"]["ans3"]["correct"] = True
    
        data2["params"]["part4"]["ans4"]["value"] = "The track is frictionless because $a_{expected}$ agrees with $a_{measured}$."
        data2["params"]["part4"]["ans4"]["correct"] = False
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    pass
    
