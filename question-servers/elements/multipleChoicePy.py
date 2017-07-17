import random, lxml.html
import prairielearn

def prepare(element_html, variant_seed, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = element.get("name")

    print("This is some debugging output from multipleChoicePy for element name '%s'" % name)

    answers = [];
    for child in element:
        if child.tag == "answer":
            correct = (child.get("correct") == "true")
            child_html = prairielearn.inner_html(child)
            answers.append((correct, child_html))
    random.shuffle(answers)

    display_answers = []
    true_index = 0
    for (i, (correct, html)) in enumerate(answers):
        display_answers.append({"key": chr(ord('a') + i), "html": html})
        if correct:
            true_index = i

    question_data["params"][name] = display_answers
    question_data["params"]["_grade"][name] = "multipleChoicePy"
    question_data["params"]["_weights"][name] = 1
    question_data["true_answer"][name] = display_answers[true_index]

    return question_data

def render(element_html, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = element.get("name")

    answers = question_data["params"].get(name, [])

    submitted_key = None
    if "submitted_answer" in question_data:
        submitted_key = question_data["submitted_answer"].get(name, None)

    editable = question_data.get("editable", False)

    html = "";
    for answer in answers:
        html += '<div class="radio">\n' \
                + '  <label>\n' \
                + '    <input type="radio"' \
                + ' name="' + name + '" value="' + answer["key"] + '"' \
                + ('' if editable else ' disabled') \
                + (' checked ' if (submitted_key == answer["key"]) else '') \
                + ' />\n' \
                + '    (' + answer["key"] + ') ' + answer["html"] + '\n' \
                + '  </label>\n' \
                + '</div>\n'

    return html

def grade(name, question_data, *args):
    submitted_key = question_data["submitted_answer"].get(name, None)
    true_key = question_data["true_answer"].get(name, {"key": None}).get("key", None)
    if (submitted_key == None or true_key == None):
        return {"score": 0}

    score = 0
    if (true_key == submitted_key):
        score = 1

    grading = {"score": score}
    return grading
