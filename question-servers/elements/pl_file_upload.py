import lxml.html
from html import escape
import chevron
import to_precision
import prairielearn as pl
import json

def get_dependencies(element_html, element_index, data):
    return {
        'globalScripts': [
            'lodash.min.js',
            'dropzone.js'
        ],
        'scripts': [
            'pl_file_upload.js'
        ],
        'styles': [
            'pl_file_upload.css'
        ]
    }

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["filenames"]
    optional_attribs = ["answers_name"]
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers_name", "_files")

    return data

def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers_name", "_files")
    filenames = pl.get_string_attrib(element, "filenames", "")
    uuid = pl.get_uuid();

    html_params = {'name': name, 'filenames': filenames, 'uuid': uuid}

    files = data["submitted_answers"].get(name, None)
    if files is not None:
        html_params['has_files'] = True
        html_params['files'] = json.dumps(files)
    else:
        html_params['has_files'] = False

    if data["panel"] == "question":
        html_params['question'] = True
        with open('pl_file_upload.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()

    elif data["panel"] == "submission":
        html_params['submission'] = True
        with open('pl_file_upload.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()
    else:
        html = ""

    return html

def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers_name", "_files")

    # Get submitted answer or return parse_error if it does not exist
    files = data["submitted_answers"].get(name, None)
    if not files:
        data["parse_errors"][name] = 'No submitted answer.'
        data["submitted_answers"][name] = None
        return data

    try:
        data["submitted_answers"][name] = json.loads(files)
    except ValueError:
        data["parse_errors"][name] = 'Could not parse files'
        data["submitted_answers"][name] = None

    return data

def grade(element_html, element_index, data):
    return data
