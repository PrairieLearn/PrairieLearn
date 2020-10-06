import prairielearn as pl
import lxml.html
import chevron
import base64
import hashlib
import os


EDITOR_CONFIG_FUNCTION_DEFAULT = None
ACE_MODE_DEFAULT = None
ACE_THEME_DEFAULT = None
SOURCE_FILE_NAME_DEFAULT = None
MIN_LINES_DEFAULT = None
MAX_LINES_DEFAULT = None
AUTO_RESIZE_DEFAULT = True
PREVIEW_DEFAULT = None
FOCUS_DEFAULT = False


def get_answer_name(file_name):
    return '_file_editor_{0}'.format(hashlib.sha1(file_name.encode('utf-8')).hexdigest())


def add_format_error(data, error_string):
    if '_files' not in data['format_errors']:
        data['format_errors']['_files'] = []
    data['format_errors']['_files'].append(error_string)


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['file-name']
    optional_attribs = ['ace-mode', 'ace-theme', 'editor-config-function', 'source-file-name', 'min-lines', 'max-lines', 'auto-resize', 'preview', 'focus']
    pl.check_attribs(element, required_attribs, optional_attribs)
    source_file_name = pl.get_string_attrib(element, 'source-file-name', SOURCE_FILE_NAME_DEFAULT)

    file_name = pl.get_string_attrib(element, 'file-name')
    if '_required_file_names' not in data['params']:
        data['params']['_required_file_names'] = []
    elif file_name in data['params']['_required_file_names']:
        raise Exception('There is more than one file editor with the same file name.')
    data['params']['_required_file_names'].append(file_name)

    if source_file_name is not None:
        if element.text is not None and not str(element.text).isspace():
            raise Exception('Existing code cannot be added inside html element when "source-file-name" attribute is used.')


def render(element_html, data):
    if data['panel'] != 'question':
        return ''

    element = lxml.html.fragment_fromstring(element_html)
    file_name = pl.get_string_attrib(element, 'file-name', '')
    answer_name = get_answer_name(file_name)
    editor_config_function = pl.get_string_attrib(element, 'editor-config-function', EDITOR_CONFIG_FUNCTION_DEFAULT)
    ace_mode = pl.get_string_attrib(element, 'ace-mode', ACE_MODE_DEFAULT)
    ace_theme = pl.get_string_attrib(element, 'ace-theme', ACE_THEME_DEFAULT)
    uuid = pl.get_uuid()
    source_file_name = pl.get_string_attrib(element, 'source-file-name', SOURCE_FILE_NAME_DEFAULT)
    min_lines = pl.get_integer_attrib(element, 'min-lines', MIN_LINES_DEFAULT)
    max_lines = pl.get_integer_attrib(element, 'max-lines', MAX_LINES_DEFAULT)
    auto_resize = pl.get_boolean_attrib(element, 'auto-resize', AUTO_RESIZE_DEFAULT)
    preview = pl.get_string_attrib(element, 'preview', PREVIEW_DEFAULT)
    focus = pl.get_boolean_attrib(element, 'focus', FOCUS_DEFAULT)

    # stringify boolean attributes (needed when written to html_params)
    auto_resize = 'true' if auto_resize else 'false'
    focus = 'true' if focus else 'false'

    # If auto_resize is set but min_lines isn't, the height of the
    # file editor area will be set to 1 line. Thus, we need to set
    # a default of about 18 lines to match an editor window without
    # the auto resizing enabled.
    if min_lines is None and auto_resize == 'true':
        min_lines = 18

    html_params = {
        'name': answer_name,
        'file_name': file_name,
        'ace_mode': ace_mode,
        'ace_theme': ace_theme,
        'editor_config_function': editor_config_function,
        'min_lines': min_lines,
        'max_lines': max_lines,
        'auto_resize': auto_resize,
        'preview': preview,
        'uuid': uuid,
        'focus': focus
    }

    if source_file_name is not None:
        file_path = os.path.join(data['options']['question_path'], source_file_name)
        text_display = open(file_path).read()
    else:
        if element.text is not None:
            text_display = str(element.text)
        else:
            text_display = ''

    html_params['original_file_contents'] = base64.b64encode(text_display.encode('UTF-8').strip()).decode()

    submitted_file_contents = data['submitted_answers'].get(answer_name, None)
    if submitted_file_contents:
        html_params['current_file_contents'] = submitted_file_contents
    else:
        html_params['current_file_contents'] = html_params['original_file_contents']

    if data['panel'] == 'question':
        html_params['question'] = True
        with open('pl-file-editor.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    else:
        html = ''

    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    file_name = pl.get_string_attrib(element, 'file-name', '')
    answer_name = get_answer_name(file_name)

    # Get submitted answer or return parse_error if it does not exist
    file_contents = data['submitted_answers'].get(answer_name, None)
    if not file_contents:
        add_format_error(data, 'No submitted answer for {0}'.format(file_name))
        return

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
        add_format_error(data, '_files was present but was not an array.')
