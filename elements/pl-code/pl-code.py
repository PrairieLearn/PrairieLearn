import prairielearn as pl
import lxml.html
import chevron
import os

allowed_languages = [
    'armasm',
    'bash',
    'cpp',
    'csharp',
    'css',
    'excel',
    'fortran',
    'go',
    'haskell',
    'html',
    'ini',
    'java',
    'javascript',
    'json',
    'julia',
    'makefile',
    'markdown',
    'mathematica',
    'matlab',
    'mipsasm',
    'objectivec',
    'ocaml',
    'perl',
    'php',
    'python',
    'r',
    'ruby',
    'shell',
    'sql',
    'tex',
    'x86asm',
    'yaml',
]


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = ['language', 'no-highlight', 'source-file-name', 'prevent-select']
    pl.check_attribs(element, required_attribs, optional_attribs)
    source_file_name = pl.get_string_attrib(element, 'source-file-name', None)

    language = pl.get_string_attrib(element, 'language', None)
    if language is not None:
        if language not in allowed_languages:
            raise Exception(f'Unknown language: "{language}". Must be one of {",".join(allowed_languages)}')

    if source_file_name is not None:
        if element.text is not None and not str(element.text).isspace():
            raise Exception('Existing code cannot be added inside html element when "source-file-name" attribute is used.')


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    language = pl.get_string_attrib(element, 'language', None)
    no_highlight = pl.get_boolean_attrib(element, 'no-highlight', False)
    specify_language = (language is not None) and (not no_highlight)
    source_file_name = pl.get_string_attrib(element, 'source-file-name', None)
    prevent_select = pl.get_boolean_attrib(element, 'prevent-select', False)

    if source_file_name is not None:
        base_path = data['options']['question_path']
        file_path = os.path.join(base_path, source_file_name)
        if not os.path.exists(file_path):
            raise Exception(f'Unknown file path: "{file_path}".')
        f = open(file_path, 'r')
        code = ''
        for line in f.readlines():
            code += line
        code = code[:-1]
        f.close()
    else:
        # Strip a single leading newline from the code, if present. This
        # avoids having spurious newlines because of HTML like:
        #
        # <pl-code>
        # some_code
        # </pl-code>
        #
        # which technically starts with a newline, but we probably
        # don't want a blank line at the start of the code block.
        code = pl.inner_html(element)
        if len(code) > 1 and code[0] == '\r' and code[1] == '\n':
            code = code[2:]
        elif len(code) > 0 and (code[0] == '\n' or code[0] == '\r'):
            code = code[1:]

    html_params = {
        'specify_language': specify_language,
        'language': language,
        'no_highlight': no_highlight,
        'code': code,
        'prevent_select': prevent_select,
    }

    with open('pl-code.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
