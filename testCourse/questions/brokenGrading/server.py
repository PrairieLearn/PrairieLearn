def generate(data):
    data["correct_answers"]["x"] = 3


def grade(_data):
    msg = "deliberately broken grading function"
    raise Exception(msg)
