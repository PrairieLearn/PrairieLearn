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

    # Compute the solution
    e0 = 8.85e-12
    k = 1/(4*np.pi*e0)
    q = 1.6e-19 # C
    d = 1e-15 # m
    F = k*q**2/d**2 # N

    # Put the solution into data['correct_answers']
    data['correct_answers']['F'] = ext.round_sig(F, 3)
    
    # Write the solutions formatted using scientific notation while keeping 3 sig figs.
    data['correct_answers']['Fstr'] = "{:.2e}".format(F) 
    
    # To display an attribution, use ext.attribution(displayAttribution, source, volume, chapter).
    # displatAttribution is a string and should be either 'true' or 'false'.  The source parameter
    # is also a string.  Currently, the allowed values are 'original' (the default) and 'OSUP' for
    # Open Stax University Physics.  The volume and chapter parameters are integers and the default
    # values are zero.
    data["params"]["attribution"] = ext.attribution(displayAttribution, source, volume, chapter)
 
# Access the submitted answers
varstr = ['F']
stringData = ['F']
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