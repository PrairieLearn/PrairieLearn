import prairielearn as pl
import lxml.html
from html import escape
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
    'plaintext',
    'python',
    'r',
    'ruby',
    'shell',
    'sql',
    'tex',
    'x86asm',
    'yaml',
]


def parse_highlight_lines(highlight_lines):
    """
    Parses a string like "1", "1-4", "1-3,5,7-8" into lists of tuples like
    [(1,1)], [(1,4)], and [(1,3),(5,5),(7,8)]
    """
    lines = []
    components = highlight_lines.split(',')
    for component in components:
        component = component.strip()
        try:
            line = int(component)
            lines.append((line, line))
        except ValueError:
            # Try parsing as "##-###"
            numbers = component.split('-')
            if len(numbers) != 2:
                return None
            try:
                start = int(numbers[0])
                end = int(numbers[1])
                lines.append((start, end))
            except ValueError:
                return None
    return lines


def line_should_be_highlighted(line_number, lines_to_highlight):
    """
    Takes an array like that produced by parse_highlight_lines and determines
    if a line of code satisfies the range.
    """
    for pair in lines_to_highlight:
        start, end = pair
        if line_number >= start and line_number <= end:
            return True
    return False


def highlight_lines_in_code(code, highlight_lines, color):
    lines_to_highlight = parse_highlight_lines(highlight_lines)
    code_lines = code.splitlines()
    line_number = 1
    result_lines = ''
    for line in code_lines:
        if line_should_be_highlighted(line_number, lines_to_highlight):
            if len(line.strip()) == 0:
                # insert line break to prevent collapsing the line
                line = '<br>'
            result_lines += '<span class="pl-code-highlighted-line" style="background-color: ' + color + ';">' + line + '</span>'
        else:
            result_lines += line + '\n'
        line_number += 1
    return result_lines


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = ['language', 'no-highlight', 'source-file-name', 'prevent-select', 'highlight-lines', 'highlight-lines-color']
    pl.check_attribs(element, required_attribs, optional_attribs)

    language = pl.get_string_attrib(element, 'language', None)
    if language is not None:
        if language not in allowed_languages:
            raise Exception(f'Unknown language: "{language}". Must be one of {",".join(allowed_languages)}')

    source_file_name = pl.get_string_attrib(element, 'source-file-name', None)
    if source_file_name is not None:
        if element.text is not None and not str(element.text).isspace():
            raise Exception('Existing code cannot be added inside html element when "source-file-name" attribute is used.')

    highlight_lines = pl.get_string_attrib(element, 'highlight-lines', None)
    if highlight_lines is not None:
        if parse_highlight_lines(highlight_lines) is None:
            raise Exception('Could not parse highlight-lines attribute; check your syntax')


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    language = pl.get_string_attrib(element, 'language', None)
    no_highlight = pl.get_boolean_attrib(element, 'no-highlight', False)
    specify_language = (language is not None) and (not no_highlight)
    source_file_name = pl.get_string_attrib(element, 'source-file-name', None)
    prevent_select = pl.get_boolean_attrib(element, 'prevent-select', False)
    highlight_lines = pl.get_string_attrib(element, 'highlight-lines', None)
    highlight_lines_color = pl.get_string_attrib(element, 'highlight-lines-color', '#b3d7ff')

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
        # Automatically escape code in file source (important for: html/xml).
        code = escape(code)
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

    if highlight_lines is not None:
        code = highlight_lines_in_code(code, highlight_lines, highlight_lines_color)

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
