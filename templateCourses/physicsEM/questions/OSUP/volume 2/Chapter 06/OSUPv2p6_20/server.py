import random, copy, math
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
chapter = 6

def generate(data):
    # Pass the rtol value to {{params.rtol}}.
    data["params"]['rtol'] = str(rtol)

    # Sample random numbers
    E = random.choice(np.linspace(0.5, 8.5, num = 81))
    p = random.choice([2, 3, 4, 5, 6])
    d = random.choice(np.linspace(0.5, 4, num = 36))

    # Put these numbers into data['params']
    data["params"]["E"] = "{:.1f}".format(E)   
    data["params"]["p"] = "{:.0f}".format(p)   
    data["params"]["d"] = "{:.1f}".format(d)     
        
    # Compute the solution
    phi = E*10**p*d**2 # N m^2/C

    # Put the solution into data['correct_answers']
    data['correct_answers']['phi'] = ext.round_sig(phi, 3)
    
    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    data['correct_answers']['phistr'] = "{:.2e}".format(phi)
    
    # To display an attribution, use ext.attribution(displayAttribution, source, volume, chapter).
    # displatAttribution is a string and should be either 'true' or 'false'.  The source parameter
    # is also a string.  Currently, the allowed values are 'original' (the default) and 'OSUP' for
    # Open Stax University Physics.  The volume and chapter parameters are integers and the default
    # values are zero.
    data["params"]["attribution"] = ext.attribution(displayAttribution, source, volume, chapter)
     
# Access the submitted answers
varstr = ['phi']
stringData = ['\\Phi']
units = ['$~\mathrm{N}\mathrm{m}^2/\mathrm{C}$'] # Use LaTeX notation $~\mathrm{unit}$
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