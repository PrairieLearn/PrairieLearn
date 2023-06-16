import numpy as np


def generate(data):

    g = 9.8
    theta = np.random.choice([15, 20, 25, 30, 35, 40])
    m1 = np.round(np.random.randint(10, 30) / 10, 2)
    m2 = np.round(np.random.randint(10, 40) / 10, 2)
    a = (m2 * g - m1 * g * np.sin(theta * np.pi / 180)) / (m1 + m2)
    T = m2 * (g - a)

    data["params"]["m1"] = float(m1)
    data["params"]["m2"] = float(m2)
    data["params"]["theta"] = float(theta)
    data["correct_answers"]["a"] = float(a)
    data["correct_answers"]["T"] = float(T)

    #####################################
    ## code to make the image
    #####################################
    height_canvas = 200
    angle = 30
    theta_rad = angle * np.pi / 180
    r = 30
    d = 40
    x1 = 80
    y1 = 80

    x2 = x1 - r
    y2 = 160

    x4 = x1 + d * np.cos(theta_rad)
    y4 = y1 + d * np.sin(theta_rad)

    height_triangle = height_canvas - y4
    base_triangle = height_triangle / np.tan(theta_rad)

    x5 = x4
    y5 = height_canvas

    x6 = x5 + base_triangle
    y6 = height_canvas

    posbox = np.random.randint(80, 100)
    hbox = 2 * r
    wbox = 2 * r
    x3 = x5 + posbox + (hbox / 2) * np.sin(theta_rad)
    y3 = height_canvas - (
        (base_triangle - posbox) * np.tan(theta_rad) + (hbox / 2) * np.cos(theta_rad)
    )

    xcoord = x5 + posbox + (1.5 * hbox) * np.sin(theta_rad)
    ycoord = height_canvas - (
        (base_triangle - posbox) * np.tan(theta_rad) + (1.5 * hbox) * np.cos(theta_rad)
    )

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
    data["params"]["normal_angle"] = -(90 - angle)
    data["params"]["xcoord"] = xcoord
    data["params"]["ycoord"] = ycoord
    data["params"]["width_arrow"] = width_arrow
    data["params"]["off1"] = hbox / 2 + width_arrow
    data["params"]["off2"] = hbox / 2

    data["params"]["height_canvas"] = height_canvas

    return data
