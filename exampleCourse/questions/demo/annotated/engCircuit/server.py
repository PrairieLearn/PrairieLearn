import random

def generate(data):

    ask = ['equivalent resistance $R_T$', 'current from the power supply $I_T$']
    which = random.choice([0,1])
    data['params']['ask'] = ask[which]

    label = ["$R_T$", "$I_T$"]
    data['params']['lab'] = label[which]

    unit = ["$\\Omega$", "A"]
    data['params']['unit'] = unit[which]

    Vt = random.randint(100,200)
    data['params']['Vt'] = Vt

    R1 = random.choice(list(range(20,180,10)))
    data['params']['R1'] = R1

    R2 = random.choice(list(range(20,180,20)))
    data['params']['R2'] = R2

    R3 = random.choice(list(range(20,100,5)))
    data['params']['R3'] = R3

    figname = ["circ1.png", "circ2.png"]
    whichfig = random.choice([0,1])
    data['params']['figname'] = figname[whichfig]

    if whichfig: # this is the series
        Rt = R1 + R2 + R3
    else: # this is the parallel
        Rtinv = 1/R1 + 1/R2 + 1/R3
        Rt = 1/Rtinv

    It = Vt/Rt
    ans = [Rt, It]

    data['correct_answers']['ans'] = ans[which]
