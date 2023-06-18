import random
import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = 'True'

feedback_dict = {'vars': ['part1_ans'],
                 'stringData': ['U'],
                 'units': ['$~\mu\mathrm{J}$']
                 }

def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases etc. 
    
    data2["params"]["vars"]["title"] = 'Energy Stored in a Capacitor'
    
    # define bounds of the variables
    c = random.choice(np.linspace(5, 15, num = 11)) # microF
    v = random.choice(np.linspace(5, 15, num = 11)) # V
    
    
    # store the variables in the dictionary "params"
    data2["params"]["c"] = "{:.0f}".format(c)
    data2["params"]["v"] = "{:.0f}".format(v)
    
    # calculate the correct
    U = 0.5*v**2*c # microJ
    
    # define correct answers
    data2["correct_answers"]["part1_ans"] = U
    
    # Write the solution formatted using scientific notation while keeping 3 sig figs.
    data2["correct_answers"]["part1_ans_str"] = "{:.0f}".format(U)
    
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
    
