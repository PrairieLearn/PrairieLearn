import random, lxml.html
import prairielearn as pl

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers_name"]
    optional_attribs = ["weight", "number_answers", "min_correct", "max_correct", "fixed_order", "inline"];
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers_name")

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

    number_answers = pl.get_integer_attrib(element, "number_answers", len_total)
    min_correct = pl.get_integer_attrib(element, "min_correct", 0)
    max_correct = pl.get_integer_attrib(element, "max_correct", len(correct_answers))

    number_answers = max(0, min(len_total, min(26, number_answers)))
    min_correct = min(len_correct, min(number_answers, max(0, max(number_answers - len_incorrect, min_correct))))
    max_correct = min(len_correct, min(number_answers, max(min_correct, max_correct)))
    if not (0 <= min_correct <= max_correct <= len_correct):
        raise Exception("INTERNAL ERROR: correct number: (%d, %d, %d, %d)" % (min_correct, max_correct, len_correct, len_incorrect))
    min_incorrect = number_answers - max_correct
    max_incorrect = number_answers - min_correct
    if not (0 <= min_incorrect <= max_incorrect <= len_incorrect):
        raise Exception("INTERNAL ERROR: incorrect number: (%d, %d, %d, %d)" % (min_incorrect, max_incorrect, len_incorrect, len_correct))

    number_correct = random.randint(min_correct, max_correct)
    number_incorrect = number_answers - number_correct

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
    correct_answer_list = []
    for (i, (index, correct, html)) in enumerate(sampled_answers):
        keyed_answer = {"key": chr(ord('a') + i), "html": html}
        display_answers.append(keyed_answer)
        if correct:
            correct_answer_list.append(keyed_answer)

    if name in data["params"]:
        raise Exception("duplicate params variable name: %s" % name)
    if name in data["correct_answers"]:
        raise Exception("duplicate correct_answers variable name: %s" % name)
    data["params"][name] = display_answers
    data["correct_answers"][name] = correct_answer_list
    return data

def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers_name")

    display_answers = data["params"].get(name, [])

    inline = pl.get_boolean_attrib(element, "inline", False)

    submitted_keys = data["submitted_answers"].get(name, [])
    # if there is only one key then it is passed as a string,
    # not as a length-one list, so we fix that next
    if isinstance(submitted_keys, str):
        submitted_keys = [submitted_keys]

    if data["panel"] == "question":
        editable = data["editable"]

        html = '';
        for answer in display_answers:
            item = '  <label' + (' class="checkbox-inline"' if inline else '') + '>\n' \
                    + '    <input type="checkbox"' \
                    + ' name="' + name + '" value="' + answer["key"] + '"' \
                    + ('' if editable else ' disabled') \
                    + (' checked ' if (answer["key"] in submitted_keys) else '') \
                    + ' />\n' \
                    + '    (' + answer["key"] + ') ' + answer["html"].strip() + '\n' \
                    + '  </label>\n'
            if not inline:
                item = '<div class="checkbox">\n' + item + '</div>\n'
            html += item
        if inline:
            html = '<p>\n' + html + '</p>\n'
    elif data["panel"] == "submission":
        if len(submitted_keys) == 0:
            html = "No selected answers"
        else:
            html_list = [];
            for submitted_key in submitted_keys:
                item = ''
                submitted_html = next((a["html"] for a in display_answers if a["key"] == submitted_key), None)
                if submitted_html is None:
                    item = "ERROR: Invalid submitted value selected: %s" % submitted_key
                else:
                    item = "(%s) %s" % (submitted_key, submitted_html)
                if inline:
                    item = '<span>' + item + '</span>\n'
                else:
                    item = '<p>' + item + '</p>\n'
                html_list.append(item)
            if inline:
                html = ', '.join(html_list) + '\n'
            else:
                html = '\n'.join(html_list) + '\n'
    elif data["panel"] == "answer":
        correct_answer_list = data["correct_answers"].get(name, [])
        if len(correct_answer_list) == 0:
            html = "No selected answers"
        else:
            html_list = [];
            for answer in correct_answer_list:
                item = "(%s) %s" % (answer["key"], answer["html"])
                if inline:
                    item = '<span>' + item + '</span>\n'
                else:
                    item = '<p>' + item + '</p>\n'
                html_list.append(item)
            if inline:
                html = ', '.join(html_list) + '\n'
            else:
                html = '\n'.join(html_list) + '\n'
    else:
        raise Exception("Invalid panel type: %s" % data["panel"])

    return html

def parse(element_html, element_index, data):
    # FIXME: check for invalid answers
    return data

def grade(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers_name")
    weight = pl.get_integer_attrib(element, "weight", 1)

    submitted_keys = data["submitted_answers"].get(name, [])
    correct_answer_list = data["correct_answers"].get(name, [])
    correct_keys = [answer["key"] for answer in correct_answer_list]

    score = 0
    if set(submitted_keys) == set(correct_keys):
        score = 1

    data["partial_scores"][name] = {"score": score, "weight": weight}
    return data

def test(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers_name")
    weight = pl.get_integer_attrib(element, "weight", 1)

    correct_answer_list = data["correct_answers"].get(name, [])
    correct_keys = [answer["key"] for answer in correct_answer_list]
    number_answers = len(data["params"][name])
    all_keys = [chr(ord('a') + i) for i in range(number_answers)]

    result = random.choice(['correct', 'incorrect'])
    if result == 'correct':
        if len(correct_keys) == 1:
            data["raw_submitted_answers"][name] = correct_keys[0]
        elif len(correct_keys) > 1:
            data["raw_submitted_answers"][name] = correct_keys
        else:
            pass # no raw_submitted_answer if no correct keys
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    elif result == 'incorrect':
        while True:
            # select answer keys at random
            ans = [k for k in all_keys if random.choice([True, False])];
            # break and use this choice if it isn't correct
            if set(ans) != set(correct_keys):
                break
        data["raw_submitted_answers"][name] = ans
        data["partial_scores"][name] = {"score": 0, "weight": weight}

        # FIXME: test invalid answers
    else:
        raise Exception('invalid result: %s' % result)

    return data

def file(element_html, element_index, data):
    return ''
