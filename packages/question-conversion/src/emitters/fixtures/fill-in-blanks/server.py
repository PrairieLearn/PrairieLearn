def grade(data):
    if data["partial_scores"].get("capital1", {}).get("score", 0) >= 1:
        data["feedback"]["answer_0"] = True
    if data["partial_scores"].get("capital2", {}).get("score", 0) >= 1:
        data["feedback"]["answer_1"] = True
