import prairielearn as pl
import lxml.html
import chevron
import os
import json
import base64

SOURCE_FILE_NAME_DEFAULT = None
SUBMITTED_FILE_NAME_DEFAULT = None
CONTENTS_DEFAULT = None
LANGUAGE_DEFAULT = 'html'


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = ['source-file-name', 'submitted-file-name', 'contents', 'language']
    pl.check_attribs(element, required_attribs, optional_attribs)

    source_file_name = pl.get_string_attrib(element, 'source-file-name', SOURCE_FILE_NAME_DEFAULT)
    submitted_file_name = pl.get_string_attrib(element, 'submitted-file-name', SUBMITTED_FILE_NAME_DEFAULT)
    contents = pl.get_string_attrib(element, 'contents', CONTENTS_DEFAULT)
    language = pl.get_string_attrib(element, 'language', LANGUAGE_DEFAULT)

    if (source_file_name is not None and (submitted_file_name is not None or contents is not None)) or (submitted_file_name is not None and contents is not None):
        raise Exception('Only one of the attributes "source-file-name", "submitted-file-name" and "contents" can be used.')

    if language not in ['html', 'markdown']:
        raise Exception('Attribute "language" must be either "html" or "markdown".')


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    source_file_name = pl.get_string_attrib(element, 'source-file-name', SOURCE_FILE_NAME_DEFAULT)
    submitted_file_name = pl.get_string_attrib(element, 'submitted-file-name', SUBMITTED_FILE_NAME_DEFAULT)
    contents = pl.get_string_attrib(element, 'contents', CONTENTS_DEFAULT)

    if source_file_name is not None:
        base_path = data['options']['question_path']
        file_path = os.path.join(base_path, source_file_name)
        if not os.path.exists(file_path):
            raise Exception(f'Unknown file path: "{file_path}".')

        with open(file_path, 'r') as f:
            contents = f.read()

    elif submitted_file_name is not None:
        files = data.get('submitted_answers', {}).get('_files', {})
        submitted_files = [f for f in files if f.get('name', '') == submitted_file_name]
        if submitted_files and 'contents' in submitted_files[0]:
            contents = str(base64.b64decode(submitted_files[0]['contents']), 'utf-8')
        else:
            contents = None

    if contents is None:
        return ''

    # Chop off ending newlines and spaces
    contents = contents.rstrip()

    # JSON dumps adds the quotes and escapes needed to have the string
    # be assigned to a JS expression.
    quoted_code = json.dumps(contents)

    html_params = {
        'contents': contents,
        'quoted_code': quoted_code,
        'language': pl.get_string_attrib(element, 'language', LANGUAGE_DEFAULT)
    }

    with open('pl-xss-safe.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
