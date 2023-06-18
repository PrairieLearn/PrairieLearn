import random
import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = 'True'

feedback_dict = {'vars': ['part1_ans'],
                 'stringData': ['\mathrm{Cost}'],
                 'units': ['dollars']
                 }

def generate(data):
    data2 = pbh.create_data2()
    
    data2["params"]["vars"]["title"] = "LED Bulb"
    data2["params"]["vars"]["units"] = "$"
    
    # define bounds of the variables
    c = round(random.uniform(0,1),2)
    h = random.randint(2,24)
    
    # store the variables in the dictionary "params"
    data2["params"]["c"] = c
    data2["params"]["h"] = h
    
    # constants
    P = 16e-3 #kW
    
    # calculate the correct
    E = P * 365 * h
    C = E * c 
    
    # define correct answers
    data2["correct_answers"]["part1_ans"] = C
    
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
    # To enable error checking, set errorCheck = 'true'.
    
    for i,k in enumerate(feedback_dict['vars']):
        data["feedback"][k] = pbh.ErrorCheck(errorCheck, data["submitted_answers"][k], data["correct_answers"][k], feedback_dict['stringData'][i], rtol)
    
