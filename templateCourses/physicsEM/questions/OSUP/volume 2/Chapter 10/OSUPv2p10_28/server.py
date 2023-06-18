import random
import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = 'True'

feedback_dict = {'vars': ['part1_ans', 'part2_ans', 'part3_ans'],
                 'stringData': ['I_1', 'I_2', 'I_3'],
                 'units': ['$~\mathrm{A}$', '$~\mathrm{A}$', '$~\mathrm{A}$']
                 }

def generate(data):
    data2 = pbh.create_data2()
    
    # Sample random numbers
    P_T = random.choice(np.linspace(1710, 1890, num = 19))  # W
    P_S = random.choice(np.linspace(1310, 1490, num = 19))  # W
    P_L = random.choice(np.linspace(60, 90, num = 7))       # W
    I_F = random.choice(np.linspace(20, 30, num = 11))      # A
    V = random.choice(np.linspace(120, 150, num = 7))       # V
    
    # Check P_L value for grammatical purposes
    if 80 <= P_L <= 90:
        prep = "an"
    else:
        prep = "a"
    
    # title
    data2["params"]["vars"]["title"] = 'Electrical Appliances Plugged into an Outlet'
    
    # Put these numbers into data['params']
    data2["params"]["P_T"] = "{:.0f}".format(P_T)
    data2["params"]["P_S"] = "{:.0f}".format(P_S)
    data2["params"]["P_L"] = "{:.1f}".format(P_L)
    data2["params"]["I_F"] = "{:.1f}".format(I_F)
    data2["params"]["V"] = "{:.1f}".format(V)
    data2["params"]["prep"] = prep
    
    # Compute the solutions
    I_T = float(P_T/V)
    I_S = float(P_S/V)
    I_L = float(P_L/V)
    
    # Put the solutions into data['correct_answers']
    data2['correct_answers']['part1_ans'] = I_T
    data2['correct_answers']['part2_ans'] = I_S
    data2['correct_answers']['part3_ans'] = I_L
    
    # define possible answers
    data2["params"]["part4"]["ans1"]["value"] = 'Yes'
    data2["params"]["part4"]["ans2"]["value"] = 'No'
    
    # Determine correct answer
    if (I_T + I_S + I_L) >= I_F:
        data2["params"]["part4"]["ans1"]["correct"] = True
        data2["params"]["part4"]["ans1"]["feedback"] = 'Great! You got it.'
        data2["params"]["part4"]["ans2"]["correct"] = False
        data2["params"]["part4"]["ans2"]["feedback"] = 'Double check your work. Is the total current drawn less than the current rating of the fuse?'
    else:
        data2["params"]["part4"]["ans1"]["correct"] = False
        data2["params"]["part4"]["ans1"]["feedback"] = 'Double check your work. Is the total current drawn greater than the current rating of the fuse?'
        data2["params"]["part4"]["ans2"]["correct"] = True
        data2["params"]["part4"]["ans2"]["feedback"] = 'Great! You got it.'
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    # Call a function to check for easily-identifiable errors.
    # The syntax is pbh.ErrorCheck(errorCheck, submittedAnswer, correctAnswer, LaTeXsyntax, relativeTolerance)
    # To enable error checking, set check = 'true'.
    
    for i,k in enumerate(feedback_dict['vars']):
        data["feedback"][k] = pbh.ErrorCheck(errorCheck, data["submitted_answers"][k], data["correct_answers"][k], feedback_dict['stringData'][i], rtol)
    
