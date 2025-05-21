# Hint is Shown if the user clicks Save & Grade


# You could also put this as a parse function 
def grade(data):
    if "c_2" in data["submitted_answers"] and data["submitted_answers"]["c_2"] == 10:
        data["feedback"]["show_hint_10"] = True
