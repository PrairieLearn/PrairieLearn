def grade(data):
    data["feedback"]["overall"] = {"is_correct": data["score"] >= 1.0}
