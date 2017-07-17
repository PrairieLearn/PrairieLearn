import lxml.html
import numpy as np
import sys
import prairielearn

def prepare(element_html, variant_seed, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = element.get("name")

    print("This is some debugging output from multipleChoicePy for element name '%s'" % name)

    # nVariables = 0
    # for child in element:
    #     if child.tag == "variable":
    #         nVariables += 1
    # questionData["params"][name] = {"nVariables": nVariables}

    return question_data

def render(element_html, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = element.get("name")

    # Count the number of variables
    nVariables = 0
    for child in element:
        if child.tag == "variable":
            nVariables += 1

    # Create textarea with number of rows equal to number of variables
    print(repr("<textarea name='"+name+"'></textarea>"))
    if nVariables>0:
        html = '<textarea name="'+name+'" cols="80" rows="'+str(nVariables)+'" style="resize:none;width:100%"></textarea>'
    else:
        html = ""
        print("WARNING: matrixInputPy element with name '%s' and zero variables" % name)

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
