import lxml.html
from html import escape
import chevron
import to_precision
import prairielearn as pl
import json
from io import StringIO
import csv

def get_filenames_as_array(raw_filenames):
    raw_filenames = StringIO(raw_filenames)
    filenames = "[]"
    reader = csv.reader(raw_filenames, delimiter=',', escapechar='\\', quoting=csv.QUOTE_NONE, skipinitialspace=True, strict=True)
    for row in reader:
        # Assume only one row
        return row

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
    uuid = pl.get_uuid();
    filenames = json.dumps(get_filenames_as_array(pl.get_string_attrib(element, "filenames", "")))

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

        parse_error = data["format_errors"].get(name, None)
        html_params['parse_error'] = parse_error

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
        data["format_errors"][name] = 'No submitted answer.'
        data["submitted_answers"][name] = None
        return data

    try:
        data["submitted_answers"][name] = json.loads(files)
    except ValueError:
        data["format_errors"][name] = 'Could not parse submitted files.'
        data["submitted_answers"][name] = None

    # Validate that all required files are present
    if data["submitted_answers"][name] is not None:
        required_filenames = get_filenames_as_array(pl.get_string_attrib(element, "filenames", ""))
        submitted_filenames = map(lambda x : x.get('name', ''), data["submitted_answers"][name])
        missing_files = [x for x in required_filenames if x not in submitted_filenames]

        if len(missing_files) > 0:
            data["format_errors"][name] = 'The following required files were missing: ' + ', '.join(missing_files)

    return data

def grade(element_html, element_index, data):
    return data
