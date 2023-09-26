def generate(data):
    a = "01011"
    b = "10010"
    data["params"]["a"] = a
    data["params"]["b"] = b

    c = "11101"
    data["correct_answers"]["c"] = c


def parse(data):
    # use get() for submitted_answers in case no answer was submitted
    # get the submitted answer, defaulting to empty string if it's missing
    sub = data["submitted_answers"].get("c", "")
    if set(sub) - {"0", "1"}:
        # format_errors tags the answer as invalid, which will keep the
        # question from being graded.
        data["format_errors"][
            "c"
        ] = "Your answer should not contain characters other than '0' and '1'"
    if sub[:1] == "0":
        # feedback does not affect the grading process and can be used for
        # neutral comments that show up even if the student selects "Save Only"
        # instead of "Save and Grade".
        # We use the "c" key in case we have multiple feedbacks for different
        # answers.
        data["feedback"]["c"] = "Leading zeros are not necessary"


def grade(data):
    sub = data["submitted_answers"].get("c", "").lstrip("0")
    if sub == data["correct_answers"]["c"]:
        data["score"] = 1
    else:
        data["score"] = 0

        # Store some feedback to display to the student.
        # This feedback is shown to students on every submission,
        # even if they have attempts remaining, so it shouldn't give away the answer.
        if len(sub) != len(data["correct_answers"]["c"]):
            data["feedback"]["c"] = "Your answer has the wrong length"
        else:
            data["feedback"][
                "c"
            ] = "Your answer was has the correct length and format, but the value is wrong"
