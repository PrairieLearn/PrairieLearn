import random, lxml.html
import prairielearn as pl

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["name"]
    optional_attribs = ["weight", "number_answers", "fixed_order", "inline"];
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = element.get("name")

    correct_answers = [];
    incorrect_answers = [];
    index = 0
    for child in element:
        if child.tag == "pl_answer":
            pl.check_attribs(child, required_attribs=[], optional_attribs=["correct"]);
            correct = pl.get_boolean_attrib(child, "correct", False)
            child_html = pl.inner_html(child)
            answer_tuple = (index, correct, child_html)
            if correct:
                correct_answers.append(answer_tuple)
            else:
                incorrect_answers.append(answer_tuple)

    len_correct = len(correct_answers)
    len_incorrect = len(incorrect_answers)
    len_total = len_correct + len_incorrect

    if len_correct < 1:
        raise Exception("pl_multiple_choice element must have at least one correct answer")

    number_answers = pl.get_integer_attrib(element, "number_answers", len_total)

    number_answers = max(1, min(1 + len_incorrect, number_answers))
    number_correct = 1
    number_incorrect = number_answers - number_correct
    if not (0 <= number_incorrect <= len_incorrect):
        raise Exception("INTERNAL ERROR: number_incorrect: (%d, %d, %d)" % (number_incorrect, len_incorrect, number_answers))

    sampled_correct = random.sample(correct_answers, number_correct)
    sampled_incorrect = random.sample(incorrect_answers, number_incorrect)

    sampled_answers = sampled_correct + sampled_incorrect
    random.shuffle(sampled_answers)

    fixed_order = pl.get_boolean_attrib(element, "fixed_order", False)
    if fixed_order:
        # we can't simply skip the shuffle because we already broke the original
        # order by separating into correct/incorrect lists
        sampled_answers.sort(key=lambda a: a[0]) # sort by stored original index

    display_answers = []
    correct_answer = None
    for (i, (index, correct, html)) in enumerate(sampled_answers):
        keyed_answer = {"key": chr(ord('a') + i), "html": html}
        display_answers.append(keyed_answer)
        if correct:
            correct_answer = keyed_answer

    if name in data["params"]:
        raise Exception("duplicate params variable name: %s" % name)
    if name in data["correct_answers"]:
        raise Exception("duplicate correct_answers variable name: %s" % name)
    data["params"][name] = display_answers
    data["correct_answers"][name] = correct_answer
    return data

def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = element.get("name")

    answers = data["params"].get(name, [])
    inline = pl.get_boolean_attrib(element, "inline", False)

    submitted_key = data["submitted_answers"].get(name, None)

    if data["panel"] == "question":
        editable = data["editable"]

        html = '';
        for answer in answers:
            item = '  <label' + (' class="radio-inline"' if inline else '') + '>\n' \
                    + '    <input type="radio"' \
                    + ' name="' + name + '" value="' + answer["key"] + '"' \
                    + ('' if editable else ' disabled') \
                    + (' checked ' if (submitted_key == answer["key"]) else '') \
                    + ' />\n' \
                    + '    (' + answer["key"] + ') ' + answer["html"] + '\n' \
                    + '  </label>\n'
            if not inline:
                item = '<div class="radio">\n' + item + '</div>\n'
            html += item
        if inline:
            html = '<p>\n' + html + '</p>\n'
    elif data["panel"] == "submission":
        if submitted_key is None:
            html = 'No submitted answer'
        else:
            submitted_html = next((a["html"] for a in answers if a["key"] == submitted_key), None)
            if submitted_html is None:
                html = "ERROR: Invalid submitted value selected: %s" % submitted_key
            else:
                html = "(%s) %s" % (submitted_key, submitted_html)
    elif data["panel"] == "answer":
        correct_answer = data["correct_answers"].get(name, None)
        if correct_answer is None:
            html = "ERROR: No true answer"
        else:
            html = "(%s) %s" % (correct_answer["key"], correct_answer["html"])
    else:
        raise Exception("Invalid panel type: %s" % data["panel"])

    return html

def parse(element_html, element_index, data):
    return data

def grade(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")
    weight = pl.get_integer_attrib(element, "weight", 1)

    submitted_key = data["submitted_answers"].get(name, None)
    true_key = data["correct_answers"].get(name, {"key": None}).get("key", None)

    score = 0
    if (submitted_key is not None and submitted_key == true_key):
        score = 1

    data["partial_scores"][name] = {"score": score, "weight": weight}
    return data
