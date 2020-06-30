import random, math

def generate(data):
    m = random.choice([3, 1.4, 1.6, 1.8])
    h = random.choice([4, 12, 14, 16])
    d = 1.5*h
    g = 9.8 
    v0xmin = d*math.sqrt(g/(2*h))
    v0x = round(random.choice([4, v0xmin*1.4, v0xmin*1.6, v0xmin*1.8]), 3)

    data["params"]["m"] = m
    data["params"]["h"] = h
    data["params"]["d"] = d
    data["params"]["v0x"] = v0x

    t = d/v0x

    data["params"]["t_c"] = round(t, 3)
    data["params"]["t_x1"] = round(math.sqrt(2*h/g), 3)
    data["params"]["t_x2"] = round(v0x*2/g, 3)

    v0y = 0.5*g*t - h/t

    data["params"]["vy_c"] = round(v0y, 2)
    data["params"]["vy_x1"] = round(-math.sqrt((g*t)**2 + v0x**2/2), 2)
    data["params"]["vy_x2"] = round( -0.5*g*t - h/2, 2)
    data["params"]["vy_x3"] = round(-math.sqrt(v0x**2 + v0y**2), 2)
    data["params"]["vy_x4"] = 0
