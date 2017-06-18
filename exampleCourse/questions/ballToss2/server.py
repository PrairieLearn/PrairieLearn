import * from random
import * from math

def get_data():
    params = {};
    
    m = choice([3, 1.4, 1.6, 1.8])
    h = choice([4, 12, 14, 16])
    d = 1.5*h
    g = 9.8 
    v0xmin = round(d*sqrt(g/(2*h)),2)
    v0x = choice([4, v0xmin*1.4, v0xmin*1.6, v0xmin*1.8])

    t = d/v0x

    params["t_c"] = round(t,3)
    params["t_x1"] = round(sqrt(2*h/g),3)
    params["t_x2"] = round(v0x*2/g,3)

    v0y = 0.5*g*t - h/t

    params["vy_c"] = round(v0y,2)
    params["vy_x1"] = round(-1*sqrt(g*g*t*t + v0x*v0x/2),2)
    params["vy_x2"] = round( -0.5*g*t-h/2,2)
    params["vy_x3"] = round(-1*sqrt(v0x*v0x+v0y*v0y),2)
    params["vy_x4"] = 0

    v0 = sqrt(v0x*v0x+v0y*v0y)

    params["v0_c"] = round(v0, 3)
    params["v0_x1"] = round(v0x - v0y, 3)
    params["v0_x2"] = round(-v0y, 3)
    params["v0_x3"] = round(g*t, 3)
    params["v0_x4"] = round(sqrt(g*g*t*t + v0x*v0x),3)
    
    return {"params": params}
