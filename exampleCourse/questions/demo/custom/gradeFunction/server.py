import random

def generate(data):

    a = "01011"
    b = "10010"
    data["params"]["a"] = a
    data["params"]["b"] = b

    c = "11101"
    data["correct_answers"]["c"] = c

def grade(data):
    # use get() for submitted_answers in case no answer was submitted
    if data["submitted_answers"].get("c", None) == data["correct_answers"]["c"]:
        data["score"] = 1
    else:
        data["score"] = 0

        # Store some feedback to display to the student.
        # We use the "c" key in case we have multiple feedbacks for different answers.
        # This feedback is shown to students on every submission,
        # even if they have attempts remaining, so it shouldn't give away the answer.

        # get the submitted answer, defaulting to empty string if it's missing
        sub = data["submitted_answers"].get("c", "")
        if len(sub.replace("0", "").replace("1", "")) > 0:
            data["feedback"]["c"] = "Your answer should not contain characters other than '0' and '1'"
        elif len(sub) != len(data["correct_answers"]["c"]):
            data["feedback"]["c"] = "Your answer has the wrong length"
        else:
            data["feedback"]["c"] = "Your answer was has the correct length and format, but the value is wrong"
