import prairielearn as pl
import lxml.html
import chevron
import os
import json

SOURCE_FILE_NAME_DEFAULT = None


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = ['source-file-name']
    pl.check_attribs(element, required_attribs, optional_attribs)

    source_file_name = pl.get_string_attrib(element, 'source-file-name', SOURCE_FILE_NAME_DEFAULT)
    if source_file_name is not None:
        if element.text is not None and not str(element.text).isspace():
            raise Exception('Existing code cannot be added inside html element when "source-file-name" attribute is used.')


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    source_file_name = pl.get_string_attrib(element, 'source-file-name', SOURCE_FILE_NAME_DEFAULT)

    if source_file_name is not None:
        base_path = data['options']['question_path']
        file_path = os.path.join(base_path, source_file_name)
        if not os.path.exists(file_path):
            raise Exception(f'Unknown file path: "{file_path}".')

        f = open(file_path, 'r')
        code = ''
        for line in f.readlines():
            code += line

        # Chop off ending newlines
        if code[:-2] == '\r\n':
            code = code[:-2]
        if code[:-1] == '\n':
            code = code[:-1]

        f.close()
    else:
        # Strip a single leading newline from the code, if present.
        code = pl.inner_html(element)
        if len(code) > 1 and code[0] == '\r' and code[1] == '\n':
            code = code[2:]
        elif len(code) > 0 and (code[0] == '\n' or code[0] == '\r'):
            code = code[1:]

    # JSON dumps adds the quotes and escapes needed to have the string
    # be assigned to a JS expression.
    quoted_code = json.dumps(code)

    html_params = {
        'code': code,
        'quoted_code': quoted_code
    }

    with open('pl-xss-safe.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
