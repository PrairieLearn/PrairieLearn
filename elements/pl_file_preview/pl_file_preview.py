import prairielearn as pl
import lxml.html
import chevron
import base64


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = []
    pl.check_attribs(element, required_attribs, optional_attribs)

    return data


def render(element_html, element_index, data):
    if data['panel'] != 'submission':
        return ''

    html_params = {'uuid': pl.get_uuid()}

    # Fetch the list of required files for this question
    required_file_names = data['params'].get('_required_file_names', [])

    # Fetch any submitted files
    submitted_files = data['submitted_answers'].get('_files', [])

    # Check for any missing files
    submitted_file_names = map(lambda x: x.get('name', ''), submitted_files)
    missing_files = [x for x in required_file_names if x not in submitted_file_names]

    # Construct an array of errors, including format error from the file input elements
    errors = data['format_errors'].get('_files', [])

    if len(missing_files) > 0:
        errors.append('The following required files were missing: {0}'.format(', '.join(missing_files)))

    html_params['errors'] = errors

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

    with open('pl_file_preview.mustache', 'r') as f:
        html = chevron.render(f, html_params).strip()

    return html
