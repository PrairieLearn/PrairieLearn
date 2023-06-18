import random
import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = 'True'

feedback_dict = {'vars': ['part1_ans'],
                 'stringData': ['V'],
                 'units': ['$~\mathrm{V}$']
                 }

def generate(data):
    data2 = pbh.create_data2()
    
    data2["params"]["vars"]["title"] = "Maximum Voltage"
    data2["params"]["vars"]["units"] = "V"
    
    # define bounds of the variables
    P = round(random.uniform(0,2),2)
    R = random.randint(1,100)
    
    # store the variables in the dictionary "params"
    data2["params"]["P"] = P
    data2["params"]["R"] = R
    
    # calculating correct answer 
    V = np.sqrt( P * R * 1e3 )
    
    # define correct answers
    data2["correct_answers"]["part1_ans"] = V
    
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
    
