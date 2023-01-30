import random


def generate(data):
    canvas_width = 600
    canvas_height = 600
    # overlay size
    data["params"]["overlay_width"] = canvas_width
    data["params"]["overlay_height"] = canvas_height
    # drawing canvas takes up 1 pixel on each border
    data["params"]["canvas_width"] = canvas_width - 2
    data["params"]["canvas_height"] = canvas_height - 2

    triples = [
        [3, 4, 5],
        [5, 12, 13],
        [8, 15, 17],
        [7, 24, 25],
        [20, 21, 29],
        [12, 35, 37],
        [9, 40, 41],
        [28, 45, 53],
        [11, 60, 61],
        [16, 63, 65],
        [33, 56, 65],
        [48, 55, 73],
        [13, 84, 85],
        [36, 77, 85],
        [39, 80, 89],
        [65, 72, 97],
    ]
    sides = random.choice(triples)
    # a is bottom side, b is right side, c is hypotenuse
    a, b, c = sides
    data["params"]["a"] = a
    data["correct_answers"]["a"] = a
    data["params"]["b"] = b
    data["correct_answers"]["b"] = b
    data["params"]["c"] = c
    data["correct_answers"]["c"] = c

    triangle_max_size = 500
    if a > b:
        triangle_width = triangle_max_size
        triangle_height = triangle_max_size * (b / a)
    else:
        triangle_width = triangle_max_size * (a / b)
        triangle_height = triangle_max_size

    center_x = canvas_width / 2
    center_y = canvas_height / 2

    # bottom left
    data["params"]["tri_x1"] = center_x - triangle_width / 2
    data["params"]["tri_y1"] = center_y + triangle_height / 2
    # bottom right
    data["params"]["tri_x2"] = center_x + triangle_width / 2
    data["params"]["tri_y2"] = center_y + triangle_height / 2
    # top right
    data["params"]["tri_x3"] = center_x + triangle_width / 2
    data["params"]["tri_y3"] = center_y - triangle_height / 2

    missing_side = random.randint(1, 3)

    data["params"]["display_a"] = bool(missing_side != 1)
    data["params"]["display_b"] = bool(missing_side != 2)
    data["params"]["display_c"] = bool(missing_side != 3)

    data["params"]["a_x"] = center_x
    data["params"]["a_y"] = center_y + triangle_height / 2 + 20
    data["params"]["b_x"] = center_x + triangle_width / 2 + 20
    data["params"]["b_y"] = center_y
    data["params"]["c_x"] = center_x - 14
    data["params"]["c_y"] = center_y - 14
