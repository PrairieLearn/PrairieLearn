import prairielearn as pl
import lxml.html
import chevron
import base64


def get_answer_name(file_name):
    return '_file_editor_{0}'.format(file_name)


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['file_name']
    optional_attribs = ['ace_mode', 'ace_theme', 'editor_config_function']
    pl.check_attribs(element, required_attribs, optional_attribs)

    if '_required_file_names' not in data['params']:
        data['params']['_required_file_names'] = []
    data['params']['_required_file_names'].append(pl.get_string_attrib(element, 'file_name'))

    return data


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    file_name = pl.get_string_attrib(element, 'file_name', '')
    answer_name = get_answer_name(file_name)
    editor_config_function = pl.get_string_attrib(element, 'editor_config_function', None)
    ace_mode = pl.get_string_attrib(element, 'ace_mode', None)
    ace_theme = pl.get_string_attrib(element, 'ace_theme', None)
    uuid = pl.get_uuid()

    html_params = {
        'name': answer_name,
        'file_name': file_name,
        'ace_mode': ace_mode,
        'ace_theme': ace_theme,
        'editor_config_function': editor_config_function,
        'uuid': uuid
    }

    html_params['original_file_contents'] = base64.b64encode(str(element.text).encode('UTF-8').strip() or '').decode()

    submitted_file_contents = data['submitted_answers'].get(answer_name, None)
    if submitted_file_contents:
        html_params['current_file_contents'] = submitted_file_contents
    else:
        html_params['current_file_contents'] = html_params['original_file_contents']

    if data['panel'] == 'question':
        html_params['question'] = True
        with open('pl_file_editor.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()
    else:
        html = ''

    return html


def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    file_name = pl.get_string_attrib(element, 'file_name', '')
    answer_name = get_answer_name(file_name)

    # Get submitted answer or return parse_error if it does not exist
    file_contents = data['submitted_answers'].get(answer_name, None)
    if not file_contents:
        data['format_errors'][answer_name] = 'No submitted answer.'
        data['submitted_answers'][answer_name] = None
        return data

    if data['submitted_answers'].get('_files', None) is None:
        data['submitted_answers']['_files'] = []
        data['submitted_answers']['_files'].append({
            'name': file_name,
            'contents': file_contents
        })
    elif isinstance(data['submitted_answers'].get('_files', None), list):
        data['submitted_answers']['_files'].append({
            'name': file_name,
            'contents': file_contents
        })
    else:
        data['format_errors'][answer_name] = '_files was present but was not an array.'

    return data
