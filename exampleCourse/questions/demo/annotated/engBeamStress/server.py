import numpy as np
import prairielearn as pl
import pandas as pd
import random

def generate(data):

    # Creating the corner points for the I-beam cross section
    # ----------------------------------------------------------------------
    w = 100                # width of the flange
    h = 80                 # half hight of the web
    t = 14                 # thickness of the flange and web
    r1 = np.array([80,60]) # this is the reference point - corner top left
    e1 = np.array([1,0])   # unit vector in x-direction
    e2 = np.array([0,1])   # unit vector in y-direction
    r2 = r1 + w*e1
    r3 = r2 + t*e2
    r4 = r3 - ((w-t)/2)*e1
    r5 = r4 + 2*h*e2
    r6 = r3 + 2*h*e2
    r7 = r2 + 2*(t+h)*e2
    r8 = r7 - w*e1
    r9 = r8 - t*e2
    r10 = r5 - t*e1
    r11 = r4 - t*e1
    r12 = r9 - (2*h)*e2

    polygon = make_pl_polygon_input(r1,r2,r3,r4,r5,r6,r7,r8,r9,r10,r11,r12)
    data["params"]["polygon"] = polygon
    data["params"]["x1"] = float(r1[0])
    data["params"]["y1"] = float(r1[1])
    data["params"]["x2"] = float(r2[0])
    data["params"]["y2"] = float(r2[1])
    data["params"]["x3"] = float(r8[0])
    data["params"]["y3"] = float(r8[1])
    data["params"]["ox"] = float(r1[0] + w/2)
    data["params"]["oy"] = float(r1[1] + h + t)
    # ----------------------------------------------------------------------

    df = pd.read_csv("clientFilesQuestion/properties.csv" )
    selected_columns = ["Designation","h (in)", 'w (in)', 'Ix (in^4)', 'Iy (in^4)']

    m = len(df)
    pos1 = np.random.randint(0, m-10)
    # note that in general, you will need to do a check if m > 10.
    # for simplicity, I am not doing any safety check because I know the length of the given table is greater than 10
    pos2 = pos1 + 10
    df = df[selected_columns].iloc[pos1:pos2]

    m = len(df)
    select = random.sample(range(1,m), 4)

    name_list = df['Designation'].iloc[select]
    for i,name in enumerate(name_list):
        data["params"]["name"+str(i+1)] = name

    Ix = df['Ix (in^4)'].iloc[select].values
    h = df['h (in)'].iloc[select].values

    M = np.random.randint(2,8)
    data["params"]["M"] = M
    data["params"]["df"] = pl.to_json(df)

    for i in range(len(h)):
        sigma = M*(h[i]/2) / Ix[i]
        data["correct_answers"]["sigma"+str(i+1)] = sigma*100


def make_pl_polygon_input(*arg):
    npoints = len(arg)
    input = "[ "
    for i, point in enumerate(arg):
        input += '{"x":' + str(point[0]) + ', "y":' + str(point[1]) + '}'
        if i < npoints-1:
            input += ','
    input += " ] "
    return input
