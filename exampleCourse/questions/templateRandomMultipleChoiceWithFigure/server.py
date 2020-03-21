import random

def generate(data):

    #Create a list with the file name of all UIUC figures
    allUIUCfigures = ["fig"+str(i)+".jpeg" for i in range(1,8)]

    #Make a random selection of 3 figures from UIUC
    trueFig = random.sample(allUIUCfigures,3)

    #Store the true figures in data['params']
    for i,fig in enumerate(trueFig):
        data['params']['filename'+str(i+1)] = fig

    #Create a list with the file name of all non-UIUC figures
    allnonUIUCfigures = ["b"+str(i)+".jpeg" for i in range(1,5)]

    #Make a random selection for the non-UIUC figure
    falseFig = random.choice(allnonUIUCfigures)

    #Store the false figure in data['params']
    data['params']['filename'] = falseFig
