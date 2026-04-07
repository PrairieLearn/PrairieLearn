def render(data, html):
    # This rendering logic leads to an invalid submission on the first attempt,
    # and a correct submission on the second attempt once the answer is shown.
    # Note that this only works on the instructor preview page.
    if not data["answer_shown"]:
        return "No answer shown yet."
    else:
        return html
