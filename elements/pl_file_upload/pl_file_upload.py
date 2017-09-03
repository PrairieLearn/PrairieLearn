import prairielearn as pl
import lxml.html
import chevron
import json
from io import StringIO
import csv


def get_file_names_as_array(raw_file_names):
    raw_file_names = StringIO(raw_file_names)
    reader = csv.reader(raw_file_names, delimiter=',', escapechar='\\', quoting=csv.QUOTE_NONE, skipinitialspace=True, strict=True)
    for row in reader:
        # Assume only one row
        return row


def add_error(data, error_string):
    if '_files' not in data['format_errors']:
        data['format_errors']['_files'] = []
    data['format_errors']['_files'].append(error_string)


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['file_names']
    optional_attribs = []
    pl.check_attribs(element, required_attribs, optional_attribs)

    if '_required_file_names' not in data['params']:
        data['params']['_required_file_names'] = []
    file_names = get_file_names_as_array(pl.get_string_attrib(element, 'file_names'))
    data['params']['_required_file_names'].extend(file_names)

    return data


def render(element_html, element_index, data):
    if data['panel'] != 'question':
        return ''

    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name', '_files')
    uuid = pl.get_uuid()
    file_names = json.dumps(get_file_names_as_array(pl.get_string_attrib(element, 'file_names', '')))

    html_params = {'name': name, 'file_names': file_names, 'uuid': uuid}

    files = data['submitted_answers'].get(name, None)
    if files is not None:
        html_params['has_files'] = True
        html_params['files'] = json.dumps(files)
    else:
        html_params['has_files'] = False

    if data['panel'] == 'question':
        html_params['question'] = True
        with open('pl_file_upload.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'submission':
        html_params['submission'] = True

        parse_error = data['format_errors'].get(name, None)
        html_params['parse_error'] = parse_error

        with open('pl_file_upload.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()
    else:
        html = ''

    return html


def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name', '_files')

    # Get submitted answer or return parse_error if it does not exist
    files = data['submitted_answers'].get(name, None)
    if not files:
        add_error(data, 'No submitted answer.')
        return data

    try:
        data['submitted_answers'][name] = json.loads(files)
    except ValueError:
        add_error(data, 'Could not parse submitted files.')

    # Validate that all required files are present
    if data['submitted_answers'][name] is not None:
        required_file_names = get_file_names_as_array(pl.get_string_attrib(element, 'file_names', ''))
        submitted_file_names = map(lambda x: x.get('name', ''), data['submitted_answers'][name])
        missing_files = [x for x in required_file_names if x not in submitted_file_names]

        if len(missing_files) > 0:
            add_error(data, 'The following required files were missing: ' + ', '.join(missing_files))

    return data
