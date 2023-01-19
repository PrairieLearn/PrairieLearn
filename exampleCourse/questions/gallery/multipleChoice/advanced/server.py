import random, math

def generate(data):
    # gravity (m/s^2)
    g = 9.8
    # mass of the ball (kg)
    m = random.choice([3, 1.4, 1.6, 1.8])
    # angle with horizontal (in degrees) 
    theta = random.randint(20,40)
    # initial velocity  (m/s)
    v0 = random.randint(18,25)
    # initial velocity components (m/s)
    v0x = v0*math.cos(theta*math.pi/180)
    v0y = v0*math.sin(theta*math.pi/180)

    # storing the parameters
    data["params"]["m"] = m

    data["params"]["v0"] = v0
    data["params"]["theta"] = theta
    
    # determines if the option "none of the above" will be used or not
    data["params"]["none"] = "false" #random.choice(["false","true"])

    if random.choice([0,1]): # This variant provides the distance and asks for the time

        # horizontal distance (m)
        d = random.randint(4,16)
        # time in the air (s)
        t = d/v0x
        # height of the cliff (m)
        h = round(v0y*t + 0.5*g*t**2,3)
        data["params"]["h"] = h
        # question statement
        data["params"]["question_text"] = 'Suppose the ball hits the ground a distance $d = ' + str(d) + '\\rm\\ m$ from the base of the cliff. How long is the ball in the air?'    
        # this is the correct answer
        data["params"]["t_c"] = '$t = ' + str(round(t,3)) + '\\rm\\ s$'
        # these are the distractors
        data["params"]["t_x1"] = '$t = ' + str(round(math.sqrt(2*h/g), 3)) + '\\rm\\ s$'
        data["params"]["t_x2"] = '$t = ' + str(round(d/v0, 3)) + '\\rm\\ s$'
        data["params"]["t_x3"] = '$t = ' + str(round(d/v0y, 3)) + '\\rm\\ s$'
        data["params"]["t_x4"] = '$t = ' + str(round(h/v0y, 3)) + '\\rm\\ s$'

    else: # This variant provides the time and asks for the distance

        # time in the air (s)
        t = round(random.uniform(0.5,0.8),2)
        # horizontal distance (m)
        d = v0x*t
        # height of the cliff (m)
        h = round(v0y*t + 0.5*g*t**2,3)
        data["params"]["h"] = h
        # question statement
        data["params"]["question_text"] = 'Suppose the ball hits the ground after $t = ' + str(t) + '\\rm\\ s$. What is the distance from the base of the cliff that the ball hits the ground?'
        # this is the correct answer
        data["params"]["t_c"] = '$d = ' + str(round(d,3)) + '\\rm\\ m$'
        # these are the distractors
        data["params"]["t_x1"] = '$d = ' + str(round(v0*t,3)) + '\\rm\\ m$'
        data["params"]["t_x2"] = '$d = ' + str(round(v0y*t,3)) + '\\rm\\ m$'
        data["params"]["t_x3"] = '$d = ' + str(round(0.5*g*t**2,3)) + '\\rm\\ m$'
        data["params"]["t_x4"] = '$d = ' + str(round(d + 0.5*g*t**2,3)) + '\\rm\\ m$'




