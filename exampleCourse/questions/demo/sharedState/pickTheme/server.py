def grade(data):
    name = "theme"

    options = data["params"][name]
    submitted_key = data["submitted_answers"].get(name)
    selected_html = next(
        (option["html"] for option in options if option["key"] == submitted_key), None
    )
    theme = selected_html.strip().lower() if selected_html else None

    if theme in ("sports", "cooking", "travel"):
        data["shared_state"]["assessmentTheme"]["theme"] = theme

    data["score"] = 1.0
    data["partial_scores"][name] = {"score": None}
