import random
import math



def generate(data):

    pA = [60,60]
    L = 200
    h = 120

    pB = [pA[0]+L/2 , pA[1]]
    pC = [pA[0]+L , pA[1]]
    pD = [pA[0]+L , pA[1]+h]
    pE = [pA[0]+L/2 , pA[1]+h]
    pF = [pA[0] , pA[1]+h]

    data["params"]["pA"] = pA
    data["params"]["pB"] = pB
    data["params"]["pC"] = pC
    data["params"]["pD"] = pD
    data["params"]["pE"] = pE
    data["params"]["pF"] = pF

    line = f'<pl-capacitor   x1={pF[0]} y1={pF[1]} x2={pD[0]}  y2={pD[1]}></pl-capacitor>'
    data["params"]["randomItems"] = line

    # if random.choice([0,1]):
    #     line = '<pl-capacitor   x1="{ {{params.pF.0}} }" y1="{ {{params.pF.1}} }" x2="{ {{params.pD.0}} }" y2="{ {{params.pD.1}} }"></pl-capacitor>'
    #     data["params"]["randomItems"] = line
    # else:
    #     line1 = "<pl-capacitor   x1={{params.pB.0}} y1={{params.pB.1}} x2={{params.pE.0}} y2={{params.pE.1}}></pl-capacitor>"
    #     line2 = "<pl-line   x1={{params.pF.0}} y1={{params.pF.1}} x2={{params.pD.0}} y2={{params.pD.1}}></pl-line>"
    #     data["params"]["randomItems"] = line1 + line2     









