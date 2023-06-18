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
    q = random.choice(np.linspace(-50, -10, num = 9))
    r = random.choice(np.linspace(8, 12, num = 41))
    r1 = random.choice(np.linspace(4, 7, num = 31))
    r2 = random.choice(np.linspace(14, 18, num = 41))

    # Put these numbers into data['params']
    data["params"]["q"] = "{:.1f}".format(q)
    data["params"]["r"] = "{:.1f}".format(r)
    data["params"]["r1"] = "{:.1f}".format(r1)
    data["params"]["r2"] = "{:.1f}".format(r2)
        
    # Compute the solutions
    e0 = 8.85e-12 # C^2/N m^2
    E1 = q*10**-6*(r1/r)**3/(4*np.pi*e0*(r1/100)**2)
    E2 = q*10**-6/(4*np.pi*e0*(r2/100)**2)

    # Put the solutions into data['correct_answers']
    data['correct_answers']['E1'] = ext.round_sig(E1, 3)
    data['correct_answers']['E2'] = ext.round_sig(E2, 3)
    
    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    data['correct_answers']['E1str'] = "{:.2e}".format(E1)
    data['correct_answers']['E2str'] = "{:.2e}".format(E2)
    
    # To display an attribution, use ext.attribution(displayAttribution, source, volume, chapter).
    # displatAttribution is a string and should be either 'true' or 'false'.  The source parameter
    # is also a string.  Currently, the allowed values are 'original' (the default) and 'OSUP' for
    # Open Stax University Physics.  The volume and chapter parameters are integers and the default
    # values are zero.
    data["params"]["attribution"] = ext.attribution(displayAttribution, source, volume, chapter)
    
# Access the submitted answers
varstr = ['E1', 'E2']
stringData = ['\mathbf{E}_1', '\mathbf{E}_2']
units = ['$~\mathrm{N}/\mathrm{C}~\hat{r}$', '$~\mathrm{N}/\mathrm{C}~\hat{r}$'] # Use LaTeX notation $~\mathrm{unit}$
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