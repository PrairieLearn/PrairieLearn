import random
import numpy as np
import pandas as pd
import problem_bank_helpers as pbh
from collections import defaultdict
nested_dict = lambda: defaultdict(nested_dict)

# Feedback params
rtol = 0.03
errorCheck = 'True'
feedback_dict = {'vars': ['part1_ans', 'part2_ans', 'part3_ans', 'part4_ans', 'part5_ans', 'part6_ans', 'part7_ans', 'part8_ans', 'part9_ans', 'part10_ans', 'part11_ans'],
                 'stringData': ['R', 'I_1', 'I_2', 'I_3', 'V_1', 'V_2', 'V_3', 'P_1', 'P_2', 'P_3', 'P'],
                 'units': ['$~\rm\ \Omega$', '$~\mathrm{A}$', '$~\mathrm{A}$', '$~\mathrm{A}$', '$~\mathrm{V}$', '$~\mathrm{V}$', '$~\mathrm{V}$', '$~\mathrm{W}$', '$~\mathrm{W}$', '$~\mathrm{W}$', '$~\mathrm{W}$']
                 }

def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = "Simple Series Circuit"
    
    # Sample random numbers
    V = random.choice(np.linspace(12, 20, num = 9))     # V
    R1 = random.choice(np.linspace(3, 5, num = 9))      # Ohm
    R2 = random.choice(np.linspace(1, 4, num = 13))     # Ohm
    R3 = random.choice(np.linspace(3, 5, num = 9))      # Ohm
    
    # Put these numbers into data['params']
    data2["params"]["V"] = "{:.1f}".format(V)
    data2["params"]["R1"] = "{:.2f}".format(R1)
    data2["params"]["R2"] = "{:.2f}".format(R2)
    data2["params"]["R3"] = "{:.2f}".format(R3)
    
    # Compute the solutions
    R_T = float(R1+R2+R3)
    I = float(V/R_T)
    V1 = float(I*R1)
    V2 = float(I*R2)
    V3 = float(I*R3)
    P1 = float(R1*I**2)
    P2 = float(R2*I**2)
    P3 = float(R3*I**2)
    P_b = float(P1+P2+P3)
    
    # Put the solutions into data['correct_answers']
    data2['correct_answers']['part1_ans'] = R_T
    data2['correct_answers']['part2_ans'] = I
    data2['correct_answers']['part3_ans'] = I
    data2['correct_answers']['part4_ans'] = I
    data2['correct_answers']['part5_ans'] = V1
    data2['correct_answers']['part6_ans'] = V2
    data2['correct_answers']['part7_ans'] = V3
    data2['correct_answers']['part8_ans'] = P1
    data2['correct_answers']['part9_ans'] = P2
    data2['correct_answers']['part10_ans'] = P3
    data2['correct_answers']['part11_ans'] = P_b
    
    # Write the formatted solution.
    data2["correct_answers"]["part1_ans_str"] = "{:.3g}".format(R_T)
    data2["correct_answers"]["part2_ans_str"] = "{:.3g}".format(I)
    data2["correct_answers"]["part3_ans_str"] = "{:.3g}".format(I)
    data2["correct_answers"]["part4_ans_str"] = "{:.3g}".format(I)
    data2["correct_answers"]["part5_ans_str"] = "{:.3g}".format(V1)
    data2["correct_answers"]["part6_ans_str"] = "{:.3g}".format(V2)
    data2["correct_answers"]["part7_ans_str"] = "{:.3g}".format(V3)
    data2["correct_answers"]["part8_ans_str"] = "{:.3g}".format(P1)
    data2["correct_answers"]["part9_ans_str"] = "{:.3g}".format(P2)
    data2["correct_answers"]["part10_ans_str"] = "{:.3g}".format(P3)
    data2["correct_answers"]["part11_ans_str"] = "{:.3g}".format(P_b)
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    # Call a function to check for easily-identifiable errors.
    # The syntax is pbh.ErrorCheck(errorCheck, submittedAnswer, correctAnswer, LaTeXsyntax, relativeTolerance)
    # To enable error checking, set errorCheck = 'true'.
    for i,k in enumerate(feedback_dict['vars']):
        data["feedback"][k] = pbh.ErrorCheck(errorCheck, data["submitted_answers"][k], data["correct_answers"][k], feedback_dict['stringData'][i], rtol)
    
