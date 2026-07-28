def grade(data):
    name = "theme"

    # `pl-multiple-choice` reports the submitted answer as an opaque key
    # (e.g. "a", "b", "c") that's only meaningful together with the
    # `{key, html, ...}` options list it also stores in `data["params"]`;
    # look up the literal choice text through that list.
    options = data["params"][name]
    submitted_key = data["submitted_answers"].get(name)
    selected_html = next(
        (option["html"] for option in options if option["key"] == submitted_key), None
    )
    theme = selected_html.strip().lower() if selected_html else None

    # print( data["shared_state"])
    if theme in ("sports", "cooking", "travel"):
        # if "assessmentTheme" not in data["shared_state"]: 
        #     data["shared_state"]["assessmentTheme"] = {}
        data["shared_state"]["assessmentTheme"]["theme"] = theme

    data["score"] = 1.0
    data["partial_scores"][name] = {"score": None}
