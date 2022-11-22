import numpy as np

def generate(data):

    alpha = int(np.random.choice([-1,1])*np.random.choice([30,45,60,120,150]))
    data['params']['angle'] = alpha
    data['params']['grade_angle'] = -alpha

    return data
