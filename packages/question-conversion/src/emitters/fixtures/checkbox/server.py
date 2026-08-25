def grade(data):
    _submitted = data["submitted_answers"].get("answer") or []
    if isinstance(_submitted, str):
        _submitted = [_submitted]
    _selected_answer_html = {
        answer["html"]
        for answer in data["params"].get("answer") or []
        if answer["key"] in _submitted
    }
    if "2" in _selected_answer_html:
        data["feedback"]["answer_0"] = True
    if "4" in _selected_answer_html:
        data["feedback"]["answer_1"] = True
    if "5" in _selected_answer_html:
        data["feedback"]["answer_2"] = True
    data["feedback"]["overall"] = {"is_correct": data["score"] >= 1.0}
