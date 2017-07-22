import random, lxml.html
import prairielearn as pl

def prepare(element_html, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    true_answer = pl.get_float_attrib(element, "true_answer", None)
    if true_answer is not None:
        if name in question_data["true_answer"]:
            raise Exception("duplicate true_answer variable name: %s" % name)
        question_data["true_answer"][name] = true_answer

    return question_data

def render(element_html, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    if question_data["panel"] == "question":
        editable = question_data.get("editable", False)
        raw_submitted_answer = question_data["raw_submitted_answer"].get(name, None)

        # FIXME: URL encode raw_submitted_answer
        html = '<input name="' + name + '"' \
            + ('' if editable else ' disabled') \
            + ('' if (raw_submitted_answer is None) else (' value="' + raw_submitted_answer + '"')) \
            + ' >\n';
    elif question_data["panel"] == "submission":
        submitted_answer = question_data["submitted_answer"].get(name, None)
        parse_error = question_data["parse_errors"].get(name, None)
        if parse_error is not None:
            html = parse_error
        else:
            html = "%g" % submitted_answer # FIXME: render this properly with sig_figs
    elif question_data["panel"] == "answer":
        true_answer = question_data["submitted_answer"].get(name, None)
        if true_answer is None:
            html = "No true_answer for variable: %s" % name
        else:
            html = "%g" % true_answer # FIXME: render this properly with sig_figs
    else:
        raise Exception("Invalid panel type: %s" % question_data["panel"])

    return html

def parse(element_html, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    if name not in question_data["submitted_answer"]:
        question_data["parse_errors"][name] = "No answer submitted";
        return question_data

    try:
        question_data["submitted_answer"][name] = float(question_data["submitted_answer"][name])
    except ValueError:
        question_data["parse_errors"][name] = "Invalid format for a number: \"%s\"" % question_data["submitted_answer"][name]

    return question_data

def grade(element_html, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")
    weight = pl.get_integer_attrib(element, "weight", 1)
    sig_figs = pl.get_integer_attrib(element, "sig_figs", 3)
    # FIXME: add rtol/atol/dec_places

    submitted_answer = question_data["submitted_answer"].get(name, None)
    true_answer = question_data["true_answer"].get(name, None)

    score = 0
    if (submitted_answer is not None and submitted_answer == true_answer):
        score = 1

    question_data["partial_scores"][name] = {"score": score, "weight": weight}
    return question_data
