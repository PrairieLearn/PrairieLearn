def generate(data):
    # Set up parameters for the drawing
    height_canvas = 300
    data["params"]["height_canvas"] = height_canvas

    # Target point position (centroid of the rectangle)
    xA = 150
    yA = 150

    data["params"]["xA"] = xA
    data["params"]["yA"] = yA

    # Rectangle dimensions
    rect_width = 120
    rect_height = 100

    data["params"]["rect_width"] = rect_width
    data["params"]["rect_height"] = rect_height

    # Numeric answer for the second part
    data["correct_answers"]["area"] = rect_width * rect_height
