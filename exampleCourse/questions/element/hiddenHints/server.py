# Hint is Shown if the user clicks Save & Grade


def grade(data):
    if data["submitted_answers"]["c_2"] == 35:
        data["feedback"]["show_hint_35"] = True


# Hint is Shown if the user clicks Save only


def parse(data):
    if data["submitted_answers"]["c_2"] == 53:
        data["feedback"]["show_hint_53"] = True
