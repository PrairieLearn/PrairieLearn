import random, math

def generate(data):
    # gravity (m/s^2)
    g = 9.8
    # mass of the ball (kg)
    m = random.choice([3, 1.4, 1.6, 1.8])
    # horizontal distance (m)
    d = random.randint(4,16)
    # angle with horizontal (in degrees) 
    theta = random.randint(20,40)
    # initial velocity  (m/s)
    v0 = random.randint(18,25)
    # initial velocity components (m/s)
    v0x = v0*math.cos(theta*math.pi/180)
    v0y = v0*math.sin(theta*math.pi/180)
    # time in the air (s)
    t = round(d/v0x)
    # height of the cliff (m)
    h = round(v0y*t + 0.5*g*t**2,3)

    # storing the parameters
    data["params"]["m"] = m
    data["params"]["h"] = h
    data["params"]["d"] = d
    data["params"]["v0"] = v0
    data["params"]["theta"] = theta

    # determines if the option "none of the above" will be used or not
    data["params"]["none"] = random.choice(["false","true"])

    # this is the correct answer
    data["params"]["t_c"] = t
    # these are the distractors
    data["params"]["t_x1"] = round(math.sqrt(2*h/g), 3)
    data["params"]["t_x2"] = round(d/v0, 3)
    data["params"]["t_x3"] = round(d/v0y, 3)
    data["params"]["t_x4"] = round(h/v0y, 3)
