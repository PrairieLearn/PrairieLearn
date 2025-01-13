def generate(data):
    data["correct_answers"]["x"] = 3


def grade(data):
    raise RuntimeError("deliberately broken grading function")
