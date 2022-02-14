import lxml
import prairielearn as pl
import lxml.html as xml
import random
import chevron
import os
import base64
import markdown
import json

SOLUTION_CODE_FILE    = 'solution.py'
SOLUTION_NOTES_FILE   = 'solution_notes.md'

def prepare(element_html, data):
    data['params']['random_number'] = random.random()
    return data


#
# Helper functions
#
def read_file_lines(data, filename, error_if_not_found=True):
    """Return a string of newline-separated lines of code from some file in serverFilesQuestion."""
    path = os.path.join(data["options"]["question_path"], 'serverFilesQuestion', filename)
    try:
        f = open(path, 'r')
        return f.read()
    except FileNotFoundError as e:
        if error_if_not_found:
            raise e
        else:
            return False

def get_answers_name(element_html):
    # use answers-name to namespace multiple pl-faded-parsons elements on a page
    element = xml.fragment_fromstring(element_html)
    answers_name = pl.get_string_attrib(element, 'answers-name', None)
    if answers_name is not None:
        answers_name = answers_name + '-'
    else:
        answers_name = ''
    return answers_name

def get_student_code(element_html, data):
    element = xml.fragment_fromstring(element_html)
    answers_name = get_answers_name(element_html)
    student_code = data['submitted_answers'].get(answers_name + 'student-parsons-solution', None)
    return student_code

def base64_encode(s):
    return base64.b64encode(s.encode("ascii")).decode("ascii")

def render_markdown(text):
    html = markdown.markdown(text)
    return html

def render_question_panel(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    populate_info = []
    for blank in data['submitted_answers']:
        if blank[0:24] == 'parsons-solutioncodeline':
            populate_info.append({'name': blank, 'value': data['submitted_answers'][blank]})

    student_order_info = json.loads(data['submitted_answers']['starter-code-order']) if 'starter-code-order' in data['submitted_answers'] else []
    solution_order_info = json.loads(data['submitted_answers']['parsons-solution-order']) if 'parsons-solution-order' in data['submitted_answers'] else []

    html_params = {
        "code_lines":  str(element.text),
        "populate_info": populate_info,
        "student_order_info": student_order_info,
        "solution_order_info": solution_order_info,
    }
    with open('pl-faded-parsons-question.mustache', 'r') as f:
        return chevron.render(f, html_params).strip()

def render_submission_panel(element_html, data):
    """Show student what they submitted"""
    html_params = {
        'code': get_student_code(element_html, data),
    }
    with open('pl-faded-parsons-submission.mustache', 'r') as f:
        return chevron.render(f, html_params).strip()


def render_answer_panel(element_html, data):
    """Show the instructor's reference solution"""
    answers_name = get_answers_name(element_html)
    code = data['submitted_answers'].get(answers_name + 'code-lines', None)
    html_params = {
        "solution_path": "tests/ans.py",
        # "notes": render_markdown(read_file_lines(data, SOLUTION_NOTES_FILE, error_if_not_found=False))
        # "notes": data,
    }
    with open('pl-faded-parsons-answer.mustache', 'r') as f:
        return chevron.render(f, html_params).strip()

def render(element_html, data):
    panel_type = data['panel']
    if panel_type == 'question':
        return render_question_panel(element_html, data)
    elif panel_type == 'submission':
        return render_submission_panel(element_html, data)
    elif panel_type == 'answer':
        return render_answer_panel(element_html, data)
    else:
        raise Exception(f'Invalid panel type: {panel_type}')

def parse(element_html, data):
    """Parse student's submitted answer (HTML form submission)"""
    # make an XML fragment that can be passed around to other PL functions,
    # parsed/walked, etc
    element = xml.fragment_fromstring(element_html)

    # `element` is now an XML data structure - see docs for LXML library at lxml.de

    # only Python problems are allowed right now (lang MUST be "py")
    # lang = pl.get_string_attrib(element, 'language')

    file_name = pl.get_string_attrib(element, 'file-name', 'user_code.py')

    _files = [
        {
            "name": file_name,
            "contents": base64_encode(get_student_code(element_html, data))
        }
    ]
    data['submitted_answers']['_files'] = []
    data['submitted_answers']['_files'].extend(_files)
    # TBD do error checking here for other attribute values....
    # set data['format_errors']['elt'] to an error message indicating an error with the
    # contents/format of the HTML element named 'elt'

    return

def grade(element_html, data):
    """Grade the student's response; many strategies are possible..."""
    #no need because externally graded
    pass