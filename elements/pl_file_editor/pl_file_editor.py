import lxml.html
from html import escape
import chevron
import to_precision
import prairielearn as pl
import json
from io import StringIO
import csv
import base64

def get_answer_name(file_name):
    return "_file_editor_{0}".format(file_name);

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["file_name"]
    optional_attribs = []
    pl.check_attribs(element, required_attribs, optional_attribs)

    return data

def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    file_name = pl.get_string_attrib(element, "file_name", "")
    answer_name = get_answer_name(file_name)
    uuid = pl.get_uuid();

    html_params = {'name': answer_name, 'file_name': file_name, 'uuid': uuid}

    html_params["original_file_contents"] = base64.b64encode(str(element.text).encode('UTF-8').strip() or '').decode()

    submitted_file_contents = data["submitted_answers"].get(answer_name, None)
    if submitted_file_contents:
        html_params["current_file_contents"] = submitted_file_contents
    else:
        html_params["current_file_contents"] = html_params["original_file_contents"]

    if data["panel"] == "question":
        html_params['question'] = True
        with open('pl_file_editor.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()
    else:
        html = ""

    return html

def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    file_name = pl.get_string_attrib(element, "file_name", "")
    answer_name = get_answer_name(file_name)

    # Get submitted answer or return parse_error if it does not exist
    file_contents = data["submitted_answers"].get(answer_name, None)
    if not file_contents:
        data["format_errors"][answer_name] = 'No submitted answer.'
        data["submitted_answers"][answer_name] = None
        return data

    if data["submitted_answers"].get("_files", None) is None:
        data["submitted_answers"]["_files"] = []
        data["submitted_answers"]["_files"].append({
            "name": file_name,
            "contents": file_contents
        })
    elif instanceof(data["submitted_answers"].get("_files", None), list):
        data["submitted_answers"]["_files"].append({
            "name": file_name,
            "contents": file_contents
        })
    else:
        data["format_errors"][answer_name] = '_files was present but was not an array.'

    return data
