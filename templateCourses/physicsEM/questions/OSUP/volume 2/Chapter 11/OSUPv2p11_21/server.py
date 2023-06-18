import random
import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = 'True'

feedback_dict = {'vars': ['part1_ans'],
                 'stringData': ['F'],
                 'units': ['$~\mathrm{N}$']
                 }

def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases 
    data2["params"]["vars"]["title"] = "Magnetic Force on Airplane"
    
    # define bounds of the variables
    q = round(random.uniform(0.1,1),3)
    v = random.randint(500,700)
    
    # store the variables in the dictionary "params"
    data2["params"]["q"] = q
    data2["params"]["v"] = v
    
    # defining constants 
    B = 8e-5 #T
    
    ## Part 1
    
    # calculating the correct solution 
    F = B * q * 1e-6 * v 
    
    # Put the solutions into data['correct_answers']
    data2['correct_answers']['part1_ans'] = F
    
    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    data2['correct_answers']['part1_ans_str'] = pbh.roundp(F, sigfigs=3, format = 'sci')
    
    # define possible answers
    
    data2["params"]["part2"]["ans1"]["value"] = 'North'
    data2["params"]["part2"]["ans1"]["correct"] = True
    
    data2["params"]["part2"]["ans2"]["value"] = 'South'
    data2["params"]["part2"]["ans2"]["correct"] = False
    
    data2["params"]["part2"]["ans3"]["value"] = 'East'
    data2["params"]["part2"]["ans3"]["correct"] = False
    
    data2["params"]["part2"]["ans4"]["value"] = 'West'
    data2["params"]["part2"]["ans4"]["correct"] = False
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    # Call a function to check if the submitted answers should be re-expressed using scientific notation.
    for i,k in enumerate(feedback_dict['vars']):
        data["submitted_answers"][k + '_str'] = pbh.sigFigCheck(data["submitted_answers"][k], feedback_dict['stringData'][i], feedback_dict['units'][i])
    
def grade(data):
    # Call a function to check for easily-identifiable errors.
    # The syntax is pbh.ErrorCheck(errorCheck, submittedAnswer, correctAnswer, LaTeXsyntax, relativeTolerance)
    # To enable error checking, set check = 'true'.
    
    for i,k in enumerate(feedback_dict['vars']):
        data["feedback"][k] = pbh.ErrorCheck(errorCheck, data["submitted_answers"][k], data["correct_answers"][k], feedback_dict['stringData'][i], rtol)
    
