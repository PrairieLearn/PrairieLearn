import random, lxml.html
import prairielearn as pl

def prepare(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    print("hello")

    true_answer = pl.get_float_attrib(element, "true_answer", None)
    if true_answer is not None:
        if name in data["true_answer"]:
            raise Exception("duplicate true_answer variable name: %s" % name)
        data["true_answer"][name] = true_answer

    return data

def render(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    if options["panel"] == "question":
        editable = options["editable"]
        raw_submitted_answer = options["raw_submitted_answer"].get(name, None)

        # FIXME: URL encode raw_submitted_answer
        html = '<input name="' + name + '"' \
            + ('' if editable else ' disabled') \
            + ('' if (raw_submitted_answer is None) else (' value="' + raw_submitted_answer + '"')) \
            + ' >\n';
    elif options["panel"] == "submission":
        submitted_answer = data["submitted_answer"].get(name, None)
        parse_error = data["parse_errors"].get(name, None)
        if parse_error is not None:
            html = parse_error
        else:
            html = "%g" % submitted_answer # FIXME: render this properly with sig_figs
    elif options["panel"] == "answer":
        true_answer = data["true_answer"].get(name, None)
        if true_answer is None:
            html = "No true_answer for variable: %s" % name
        else:
            html = "%g" % true_answer # FIXME: render this properly with sig_figs
    else:
        raise Exception("Invalid panel type: %s" % options["panel"])

    return html

def parse(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    if name not in data["submitted_answer"]:
        data["parse_errors"][name] = "No answer submitted";
        return data

    try:
        data["submitted_answer"][name] = float(data["submitted_answer"][name])
    except ValueError:
        data["parse_errors"][name] = "Invalid format for a number: \"%s\"" % data["submitted_answer"][name]

    return data

def grade(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")
    weight = pl.get_integer_attrib(element, "weight", 1)
    sig_figs = pl.get_integer_attrib(element, "sig_figs", 3)
    # FIXME: add rtol/atol/dec_places

    submitted_answer = data["submitted_answer"].get(name, None)
    true_answer = data["true_answer"].get(name, None)

    score = 0
    if (submitted_answer is not None and submitted_answer == true_answer):
        score = 1

    data["partial_scores"][name] = {"score": score, "weight": weight}
    return data
