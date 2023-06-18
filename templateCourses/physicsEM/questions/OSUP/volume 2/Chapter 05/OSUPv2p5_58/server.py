import random, math
import numpy as np
import ext

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
    # Pass the rtol value to {{params.rtol}}.
    data["params"]['rtol'] = str(rtol)

    # Sample a random number
    d = random.choice(np.linspace(0.2, 0.3, num = 11))
    F1 = random.choice(np.linspace(0.3, 0.9, num = 7))
    add = random.choice(np.linspace(0.1, 0.3, num = 3))
    F2 = F1 + add

    # Put the values into data['params']
    data["params"]["d"] = "{:.2f}".format(d)    
    data["params"]["F1"] = "{:.1f}".format(F1)    
    data["params"]["F2"] = "{:.1f}".format(F2)

    # Compute the solution
    e0 = 8.85e-12
    k = 1/(4*np.pi*e0)
    Q = np.sqrt(F2/k)*(2*d)
    q1 = Q/2 + np.sqrt((Q/2)**2 - F1*d**2/k)
    q2 = Q/2 - np.sqrt((Q/2)**2 - F1*d**2/k)

    # Put the solutions into data['correct_answers']
    data['correct_answers']['q1'] = ext.round_sig(q1, 3)
    data['correct_answers']['q2'] = ext.round_sig(q2, 3)
    
    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    data['correct_answers']['q1str'] = "{:.2e}".format(q1)
    data['correct_answers']['q2str'] = "{:.2e}".format(q2)
    
    # To display an attribution, use ext.attribution(displayAttribution, source, volume, chapter).
    # displatAttribution is a string and should be either 'true' or 'false'.  The source parameter
    # is also a string.  Currently, the allowed values are 'original' (the default) and 'OSUP' for
    # Open Stax University Physics.  The volume and chapter parameters are integers and the default
    # values are zero.
    data["params"]["attribution"] = ext.attribution(displayAttribution, source, volume, chapter)
    
# Access the submitted answers
varstr = ['q1', 'q2']
stringData = ['q_1', 'q_2']
units = ['$~\mathrm{C}$', '$~\mathrm{C}$'] # Use LaTeX notation $~\mathrm{unit}$
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