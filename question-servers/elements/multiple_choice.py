import random, lxml.html
import prairielearn as pl

def prepare(element_html, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = element.get("name")

    correct_answers = [];
    incorrect_answers = [];
    index = 0
    for child in element:
        if child.tag == "answer":
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
        raise Exception("multiple_choice element must have at least one correct answer")

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
    true_answer = None
    for (i, (index, correct, html)) in enumerate(sampled_answers):
        keyed_answer = {"key": chr(ord('a') + i), "html": html}
        display_answers.append(keyed_answer)
        if correct:
            true_answer = keyed_answer

    if name in question_data["params"]:
        raise Exception("duplicate params variable name: %s" % name)
    if name in question_data["true_answer"]:
        raise Exception("duplicate true_answer variable name: %s" % name)
    question_data["params"][name] = display_answers
    question_data["true_answer"][name] = true_answer
    return question_data

def render(element_html, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = element.get("name")

    answers = question_data["params"].get(name, [])
    inline = pl.get_boolean_attrib(element, "inline", False)

    submitted_key = None
    if "submitted_answer" in question_data:
        submitted_key = question_data["submitted_answer"].get(name, None)

    if question_data["panel"] == "question":
        editable = question_data.get("editable", False)

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
    elif question_data["panel"] == "submission":
        if submitted_key is None:
            html = 'No submitted answer'
        else:
            submitted_html = next((a["html"] for a in answers if a["key"] == submitted_key), None)
            if submitted_html is None:
                html = "ERROR: Invalid submitted value selected: %s" % submitted_key
            else:
                html = "(%s) %s" % (submitted_key, submitted_html)
    elif question_data["panel"] == "answer":
        true_answer = question_data["true_answer"].get(name, None)
        if true_answer is None:
            html = "ERROR: No true answer"
        else:
            html = "(%s) %s" % (true_answer["key"], true_answer["html"])
    else:
        raise Exception("Invalid panel type: %s" % question_data["panel"])

    return html

def parse(element_html, element_index, question_data):
    return question_data

def grade(element_html, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")
    weight = pl.get_integer_attrib(element, "weight", 1)

    submitted_key = question_data["submitted_answer"].get(name, None)
    true_key = question_data["true_answer"].get(name, {"key": None}).get("key", None)

    score = 0
    if (submitted_key is not None and submitted_key == true_key):
        score = 1

    question_data["partial_scores"][name] = {"score": score, "weight": weight}
    return question_data
