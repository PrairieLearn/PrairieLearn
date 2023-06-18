import random, math
import numpy as np
import ext
import problem_bank_helpers as pbh
from collections import defaultdict
nested_dict = lambda: defaultdict(nested_dict)

# Tolerance for pl-number-input
rtol = 0.03

# For error checking...
errorCheck = 'true'

# For the attribution...
displayAttribution = 'true'
source = "OSUP" 
volume = 2
chapter = 5

def generate(data):
    # Start problem code
    data2 = nested_dict()
    
    # Pass the rtol value to {{params.rtol}}.
    data2["params"]['rtol'] = str(rtol)

    # Sample a random number
    sign1 = random.choice([-1, 1])
    q1 = sign1*random.choice(np.linspace(10, 80, num = 15))
    sign2 = random.choice([-1, 1])
    q2 = sign2*random.choice(np.linspace(10, 80, num = 15))
    sign3 = random.choice([-1, 1])
    q3 = sign3*random.choice(np.linspace(10, 80, num = 15))
    d = random.choice(np.linspace(1, 4, num = 4))

    # Put the values into data['params']
    data2["params"]["q1"] = "{:.0f}".format(q1)
    data2["params"]["q2"] = "{:.0f}".format(q2)    
    data2["params"]["q3"] = "{:.0f}".format(q3)    
    data2["params"]["d"] = "{:.1f}".format(d)

    # Compute the solution
    e0 = 8.85e-12
    k = 1/(4*np.pi*e0)
    F = (4*k*q3*1e-6/d**2)*(q1 - q2)*1e-6

    # Put the solutions into data['correct_answers']
    if F == 0:
        data2['correct_answers']['part1_ans'] = F
        # Write the solutions formatted using scientific notation while keeping 3 sig figs.
        data2['correct_answers']['Fstr'] = "0.0" 
    else:
        data2['correct_answers']['part1_ans'] = np.abs(ext.round_sig(F, 3))
        # Write the solutions formatted using scientific notation while keeping 3 sig figs.
        data2['correct_answers']['Fstr'] = "{:.2e}".format(np.abs(F)) 
    
    # Define correct answers for multiple choice
    data2["params"]["part2"]["ans1"]["value"] = 'towards q1'
    data2["params"]["part2"]["ans2"]["value"] = 'towards q2'
    data2["params"]["part2"]["ans3"]["value"] = 'the force is zero'
    
    if  F > 0:
        data2["params"]["part2"]["ans1"]["correct"] = True
        data2["params"]["part2"]["ans1"]["feedback"] = 'Great! You got it.'
        data2["params"]["part2"]["ans2"]["correct"] = False
        data2["params"]["part2"]["ans2"]["feedback"] = 'Consider q1 and q2. What is the sign of the larger charge? What is the sign of q3? Is q3 attracted to or repelled by the lager charge?'
        data2["params"]["part2"]["ans3"]["correct"] = False
        data2["params"]["part2"]["ans3"]["feedback"] = 'Do q1 and q2 have the same charge?'
        
    elif F < 0:
        data2["params"]["part2"]["ans1"]["correct"] = False
        data2["params"]["part2"]["ans1"]["feedback"] = 'Consider q1 and q2. What is the sign of the larger charge? What is the sign of q3? Is q3 attracted to or repelled by the lager charge?'
        data2["params"]["part2"]["ans2"]["correct"] = True
        data2["params"]["part2"]["ans2"]["feedback"] = 'Great! You got it.'
        data2["params"]["part2"]["ans3"]["correct"] = False
        data2["params"]["part2"]["ans3"]["feedback"] = 'Do q1 and q2 have the same charge?'
    else:
        data2["params"]["part2"]["ans1"]["correct"] = False
        data2["params"]["part2"]["ans1"]["feedback"] = 'If q1 and q2 have the same charge, they must exert equal and opposite forces on q3.'
        data2["params"]["part2"]["ans2"]["correct"] = False
        data2["params"]["part2"]["ans2"]["feedback"] = 'If q1 and q2 have the same charge, they must exert equal and opposite forces on q3.'
        data2["params"]["part2"]["ans3"]["correct"] = True
        data2["params"]["part2"]["ans3"]["feedback"] = 'Great! You got it.'
        
    # To display an attribution, use ext.attribution(displayAttribution, source, volume, chapter).
    # displatAttribution is a string and should be either 'true' or 'false'.  The source parameter
    # is also a string.  Currently, the allowed values are 'original' (the default) and 'OSUP' for
    # Open Stax University Physics.  The volume and chapter parameters are integers and the default
    # values are zero.
    data2["params"]["attribution"] = ext.attribution(displayAttribution, source, volume, chapter)
    
    data.update(data2)
    
# Access the submitted answers
varstr = ['part1_ans']
stringData = ['part1_ans']
units = ['$~\mathrm{N}$'] # Use LaTeX notation $~\mathrm{unit}$
def parse(data):
    # Call a function to check if the submitted answers should be re-expressed using scientific notation.
    cnt = 0
    for k in varstr:
        data["submitted_answers"][k + 'str'] = ext.sigFigCheck(data["submitted_answers"][k], stringData[cnt], units[cnt])
        cnt += 1

# Provide hints.    
def grade(data):
    # Call a function to check for easily-identifiable errors.
    # The syntax is ext.ErrorCheck(errorCheck, submittedAnswer, correctAnswer, LaTeXsyntax, relativeTolerance)
    # To enable error checking, set check = 'true'.
    cnt = 0
    for k in varstr:
        data["feedback"][k] = ext.ErrorCheck(errorCheck, data["submitted_answers"][k], data["correct_answers"][k], stringData[cnt], rtol)
        cnt += 1