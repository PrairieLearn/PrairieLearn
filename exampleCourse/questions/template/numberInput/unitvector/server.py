import random


def generate(data):

    a = random.randint(1, 10)
    b = random.randint(1, 10)
    c = random.randint(5, 10)

    if random.choice([0,1]):
        a_string = "-"+str(a)
        a = -a
    else:
        a_string = str(a)

    if random.choice([0,1]):
        b_string = "-"+str(b)
        b = -b
    else:
        b_string = "+"+str(b)

    f_string = "$"+a_string+"\;\hat\imath"+b_string+"\;\hat\jmath +"+str(c)+"\;\hat k$"
    data["params"]["f_string"] = f_string

    f_mag = ((a**2) + (b**2) + (c**2)) ** 0.5

    ix = a / f_mag
    iy = b / f_mag
    iz = c / f_mag

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c

    data["correct_answers"]["ix"] = ix
    data["correct_answers"]["iy"] = iy
    data["correct_answers"]["iz"] = iz

    return data
