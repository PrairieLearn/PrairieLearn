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


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = ['language', 'no-highlight', 'source-file-name', 'source-directory']
    pl.check_attribs(element, required_attribs, optional_attribs)

    language = pl.get_string_attrib(element, 'language', None)
    if language is not None:
        if language not in allowed_languages:
            raise Exception(f'Unknown language: "{language}". Must be one of {",".join(allowed_languages)}')

    source_file_name = pl.get_string_attrib(element, 'source-file-name', None)
    if source_file_name is None:
        if pl.get_string_attrib(element, 'source-directory', None) is not None:
            raise Exception('A directory cannot be specified if "source-file-name" is not provided.')


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    language = pl.get_string_attrib(element, 'language', None)
    no_highlight = pl.get_boolean_attrib(element, 'no-highlight', False)
    specify_language = (language is not None) and (not no_highlight)
    source_file_name = pl.get_string_attrib(element, 'source-file-name', None)
    source_directory = pl.get_string_attrib(element, 'source-directory', 'clientFilesQuestion')

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

    if source_file_name is not None:
        '''
        # Get base url, which depends on the type and directory
        if source_directory == 'clientFilesQuestion':
            base_path = data['options']['question_path']
        elif source_directory == 'clientFilesCourse':
            base_path = data['options']['question_path']
        else:
            raise ValueError('directory "{}" is not valid (must be "clientFilesQuestion" or "clientFilesCourse")'.format(source_directory))
        '''
        base_path = data['options']['question_path']
        file_path = os.path.join(base_path, source_file_name)

        if not os.path.exists(file_path):
            raise Exception(f'Unknown file path: "{file_path}".')
        f = open(file_path, 'r')
        for line in f.readlines():
            code += line
        code = code[:-1]
        f.close()

    html_params = {
        'specify_language': specify_language,
        'language': language,
        'no_highlight': no_highlight,
        'code': code,
    }

    with open('pl-code.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
