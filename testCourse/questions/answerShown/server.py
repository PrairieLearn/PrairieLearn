def render(data, _html):
    # This rendering logic leads to an invalid submission on the first attempt,
    # and a correct submission on the second attempt once the answer is shown.
    # Note that this only works on the instructor preview page.
    return data["answer_shown"]
