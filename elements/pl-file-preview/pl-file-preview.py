import prairielearn as pl
import lxml.html
import chevron
import base64


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = []
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html, data):
    if data['panel'] != 'submission':
        return ''

    html_params = {'uuid': pl.get_uuid()}

    # Fetch the list of required files for this question
    required_file_names = data['params'].get('_required_file_names', [])
    html_params['required_files'] = required_file_names

    # Fetch any submitted files
    submitted_files = data['submitted_answers'].get('_files', [])

    # Pass through format errors from the file input elements
    html_params['errors'] = data['format_errors'].get('_files', [])

    # Decode and reshape files into a useful form
    if len(submitted_files) > 0:
        files = []
        for idx, file in enumerate(submitted_files):
            try:
                contents = base64.b64decode(file['contents'] or '').decode()
            except UnicodeDecodeError:
                contents = 'Unable to decode file.'
            files.append({
                'name': file['name'],
                'contents': contents,
                'index': idx
            })
        html_params['has_files'] = True
        html_params['files'] = files
    else:
        html_params['has_files'] = False

    with open('pl-file-preview.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
