# Sets the condition for the special hint to be shown based on the submitted
# value. Note that the hint is only shown if the student hits "Save & Grade"
# with a valid submission. It is also possible to set this in `parse(data)`,
# which would cause the hint to be shown in case of a "Save only" submission or
# if the submission is invalid (e.g., blank or with non-numeric values).
def grade(data):
    if data["submitted_answers"].get("c_2") == 10:
        data["feedback"]["show_hint_10"] = True
