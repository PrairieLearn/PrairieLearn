import math


def generate(data):
    x = data["params"]
    x["x1"] = 30
    x["x2"] = x["x1"] + 105
    x["x3"] = x["x2"] + 90
    x["x4"] = x["x3"] + 90
    x["y1"] = 60
    x["y2"] = x["y1"] + 90
    x["y3"] = x["y2"] + 30 * 2
    x["y4"] = x["y3"] + 75
    x["width_start_canvas"] = 1.5 * x["x4"]
    x["height_start_canvas"] = 1.5 * x["y4"]
    x["theta1"] = 180 / math.pi * math.atan2(x["y2"] - x["y3"], x["x3"] - x["x2"])
    x["neg_theta1"] = 180 + x["theta1"]
    x["theta2"] = 180 / math.pi * math.atan2(x["y1"] - x["y4"], x["x2"] - x["x1"])
    x["neg_theta2"] = 180 + x["theta2"]
    x["width_arrow"] = 48
    x["arrowhead_width"] = 0.8
    x["arrowhead_length"] = 0.8

    x["x5"] = x["x4"] + 45
    x["x6"] = x["x5"] + 90
    x["x7"] = x["x6"] + 45
    x["x8"] = x["x7"] + x["x3"] - x["x2"]
    x["x9"] = x["x6"] + x["x4"] - x["x2"]
    x["x10"] = x["x6"] + x["x3"] - x["x2"]
    x["width_canvas"] = x["x9"] - 15

    x["y5"] = x["y2"] + 105
    x["y6"] = x["y5"] + x["y3"] - x["y2"]
    x["y7"] = x["y1"] + 45
    x["height_canvas"] = x["y6"] + 60

    # shift over x coordinates to fit all exploded FBDs
    for key in ["x" + str(i) for i in range(1, 11)]:
        x[key + "exp"] = x[key] - 75

    return data
