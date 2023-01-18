import numpy as np
import random

def generate(data):

    concept = random.choice(["prime", "even", "odd"])
    data['params']['concept'] = concept

    def is_prime(a):
        return all(a % i for i in np.arange(2, a))

    if concept == "odd":
        is_odd = "true"
        is_even = "false"
    elif concept == "even":
        is_odd = "false"
        is_even = "true"

    dic = []
    if concept == "prime":
        for num in np.arange(1,20):
            if num == 1:
                dic.append({'tag': "false", 'ans': str(num)})
            else:
                dic.append({'tag': str(is_prime(num)).lower(), 'ans': str(num)})
    else:
        for num in np.arange(1,20):
            if num % 2 == 0: # this is an even number
                dic.append({'tag': is_even, 'ans': str(num)})
            else: # this is an odd number
                dic.append({'tag': is_odd, 'ans': str(num)})


    data['params']['t_options'] = dic
