import random, math
import numpy as np
from sympy import *

def generate(data):

    R = random.randint(1,9)* 1/10	
    V = random.randint(20,70)* (1/10)	
    thetaD = random.randint(30,50)
    th = math.radians(thetaD)
    dir = random.choice(['left', 'right'])
    V = round(V,1)
	
    if (dir == 'right'):
        v = V
    else:
        v = -V
			
		
    x = symbols('x')
    
    w = -v/(R*math.sin(th))
    	
    ansValue = float(w)
		
    data["params"]["R"] = R
    data["params"]["V"] = V
    data["params"]["thetaD"] = thetaD
    data["params"]["dir"] = dir
    data["correct_answers"]["ansValue"] = ansValue
        
    return data