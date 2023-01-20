import random
import math

def generate(data):

        height_canvas = 400
        angle = random.choice([30,40,50])
        theta_rad = angle*math.pi/180

        r = random.choice([25,30,35])
        d = 60
        x1 = 80
        y1 = 80

        x2 = x1-r
        y2 = 240

        x4 = x1 + d*math.cos(theta_rad)
        y4 = y1 + d*math.sin(theta_rad)

        height_triangle = height_canvas - y4
        base_triangle = height_triangle/math.tan(theta_rad)

        x5 = x4
        y5 = height_canvas

        x6 = x5 + base_triangle
        y6 = height_canvas

        posbox = random.randint(80,160)
        hbox = 2*r
        wbox = 2*r
        x3 = x5 + posbox + (hbox/2)*math.sin(theta_rad)
        y3 = height_canvas - ( (base_triangle-posbox)*math.tan(theta_rad) + (hbox/2)*math.cos(theta_rad) )

        xcoord = x5 + posbox + (1.5*hbox)*math.sin(theta_rad)
        ycoord = height_canvas - ( (base_triangle-posbox)*math.tan(theta_rad) + (1.5*hbox)*math.cos(theta_rad) )

        end_angle = 180 + angle

        width_arrow = 100

        data["params"]["x1"] = x1
        data["params"]["y1"] = y1
        data["params"]["x2"] = x2
        data["params"]["y2"] = y2
        data["params"]["x3"] = x3
        data["params"]["y3"] = y3
        data["params"]["x4"] = x4
        data["params"]["y4"] = y4
        data["params"]["x5"] = x5
        data["params"]["y5"] = y5
        data["params"]["x6"] = x6
        data["params"]["y6"] = y6
        data["params"]["r"] = r
        data["params"]["hbox"] = hbox
        data["params"]["wbox"] = wbox
        data["params"]["angle_plane"] = angle
        data["params"]["end_angle"] = end_angle
        data["params"]["normal_angle"] = -(90-angle)
        data["params"]["xcoord"] = xcoord
        data["params"]["ycoord"] = ycoord
        data["params"]["width_arrow"] = width_arrow
        data["params"]["off1"] = hbox/2 + width_arrow
        data["params"]["off2"] = hbox/2 


        data["params"]["height_canvas"] = height_canvas


        #data["correct_answers"]["Mx"] = 10

        return data
