import random
import math


def generate(data):

    m1 =  random.randint(1,4)
    m2 =  random.randint(1,4)
    c =  random.sample(range(2,6),2)
    q1 = c[0]
    q2 = c[1]
    theta = random.randint(25,40) # in degrees
    data["params"]["theta"] = theta
    theta = theta*math.pi/180 # in radians

    data["params"]["m1"] = m1
    data["params"]["m2"] = m2
    data["params"]["q1"] = q1
    data["params"]["q2"] = q2

