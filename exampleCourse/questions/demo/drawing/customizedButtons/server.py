def grade(data):
    submitted = data["submitted_answers"]["answer"]
    blue = "#0000FF"
    green = "#008000"
    red = "#FF0000"

    has_blue = False
    has_green = False
    has_red = False
    for element in submitted:
        if element["gradingName"] == "pl-circle":
            color = element["fill"]
            if color == blue:
                has_blue = True
            elif color == green:
                has_green = True
            elif color == red:
                has_red = True

    data["score"] = (float(has_blue) + float(has_green) + float(has_red)) / 3.0
