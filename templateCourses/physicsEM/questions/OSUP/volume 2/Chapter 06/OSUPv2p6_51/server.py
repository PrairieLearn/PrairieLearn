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
    E = random.choice(np.linspace(1, 9, num = 41))
    r = random.choice(np.linspace(0.4, 1.5, num = 12))
    d = random.choice(np.linspace(2, 4, num = 21))
    L = random.choice(np.linspace(5, 8, num = 31))
    
    # Put these numbers into data['params']
    data["params"]["E"] = "{:.1f}".format(E)
    data["params"]["r"] = "{:.1f}".format(r)
    data["params"]["d"] = "{:.1f}".format(d)
    data["params"]["L"] = "{:.1f}".format(L)
        
    # Compute the solutions
    e0 = 8.85e-12 # C^2/N m^2
    lam = E*2*np.pi*e0*d/100
    Phi = (lam*L/100)/e0

    # Put the solutions into data['correct_answers']
    data['correct_answers']['lam'] = ext.round_sig(lam, 3)
    data['correct_answers']['Phi'] = ext.round_sig(Phi, 3)
    
    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    data['correct_answers']['lamstr'] = "{:.2e}".format(lam)
    data['correct_answers']['Phistr'] = "{:.2e}".format(Phi)
    
    # To display an attribution, use ext.attribution(displayAttribution, source, volume, chapter).
    # displatAttribution is a string and should be either 'true' or 'false'.  The source parameter
    # is also a string.  Currently, the allowed values are 'original' (the default) and 'OSUP' for
    # Open Stax University Physics.  The volume and chapter parameters are integers and the default
    # values are zero.
    data["params"]["attribution"] = ext.attribution(displayAttribution, source, volume, chapter)
    
# Access the submitted answers
varstr = ['lam', 'Phi']
stringData = ['\\lambda', '\\Phi']
units = ['$~\mathrm{C}/\mathrm{m}$', '$~\mathrm{N}\mathrm{m}^2/\mathrm{C}$'] # Use LaTeX notation $~\mathrm{unit}$
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