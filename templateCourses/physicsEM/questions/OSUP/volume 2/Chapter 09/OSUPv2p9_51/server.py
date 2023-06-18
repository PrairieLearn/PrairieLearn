import random
import numpy as np
import pandas as pd
import problem_bank_helpers as pbh

# Feedback params
rtol = 0.03
errorCheck = 'True'

feedback_dict = {'vars': ['part1_ans', 'part2_ans'],
                 'stringData': ['I_\mathrm{max}', 'I_\mathrm{min}'],
                 'units': ['$~\mathrm{A}$', '$~\mathrm{A}$']
                 }

def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = "Range of Current Through Resistor"
    
    # define bounds of the variables
    R = random.randint(50,300)
    V = round(random.uniform(1,5),1)
    p = random.randint(1,10)
    Vtotal = 2*V
    
    # store the variables in the dictionary "params"
    data2["params"]["R"] = R
    data2["params"]["V"] = V
    data2["params"]["p"] = p
    data2["params"]["Vtotal"] = Vtotal
    
    # compute the solution
    R_min = ((100 - p)/100) * R * 1e3   # Ohms
    R_max = ((100 + p)/100) * R * 1e3   # Ohms
    I_max = (Vtotal / R_min) * 1e6    # muA
    I_min = (Vtotal / R_max) * 1e6    # muA
    
    
    # Put the solutions into data['correct_answers']
    data2['correct_answers']['part1_ans'] = I_min
    data2['correct_answers']['part2_ans'] = I_max
    
    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    # data2['correct_answers']['part1_ans_str'] = pbh.roundp(E, sigfigs=3, format = 'sci')
    
    
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
    
