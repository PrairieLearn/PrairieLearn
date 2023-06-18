import random
import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = 'True'

feedback_dict = {'vars': ['part1_ans', 'part2_ans', 'part3_ans'],
                 'stringData': ['Q', 'V_1', 'V_2'],
                 'units': ['$~\mathrm{nC}$', '$~\mathrm{V}$', '$~\mathrm{V}$']
                 }

def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = "Charge and Voltage Across Capacitors"
    
    # define bounds of the variables
    a = random.choice(np.linspace(4, 14, num = 11)) # pF
    b = random.choice(np.linspace(4.5, 14.5, num = 11)) # pF
    v = random.choice(np.linspace(300, 500, num = 21)) # V
    
    # store the variables in the dictionary "params"
    data2["params"]["a"] = "{:.1f}".format(a)
    data2["params"]["b"] = "{:.1f}".format(b)
    data2["params"]["v"] = "{:.0f}".format(v)
    
    # fixing units 
    a = a*1e-12 # F
    b = b*1e-12 # F
    
    # define correct answers
    Q = ((a*b)/(a+b))*v # C
    V_1 = Q/a # V
    V_2 = Q/b # V
    
    # Put the solutions into data['correct_answers']
    data2['correct_answers']['part1_ans'] = round(Q*1e9,3)
    data2['correct_answers']['part2_ans'] = round(V_1,3)
    data2['correct_answers']['part3_ans'] = round(V_2,3)
    
    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    # data2['correct_answers']['part1_ans_str'] = pbh.roundp(Q, sigfigs=3, format = 'sci')
    
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
    
