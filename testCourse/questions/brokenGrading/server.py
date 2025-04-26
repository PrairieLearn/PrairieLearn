def generate(data):
    data["correct_answers"]["x"] = 3


def grade(_data):
    raise RuntimeError("deliberately broken grading function")
