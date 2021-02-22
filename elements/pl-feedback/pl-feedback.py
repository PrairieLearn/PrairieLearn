import prairielearn as pl
import lxml.html
import chevron
import markdown

LANGUAGE_DEFAULT = 'markdown'
FIELD_DEFAULT = 'manual'
PROMPT_DEFAULT = 'Feedback from course staff'


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = ['language', 'field', 'prompt']
    pl.check_attribs(element, required_attribs, optional_attribs)

    allowed_languages = ['html', 'markdown']

    language = pl.get_string_attrib(element, 'language', LANGUAGE_DEFAULT)
    if language not in allowed_languages:
        raise Exception(f'Unknown language: "{language}". Must be one of {", ".join(allowed_languages)}')


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    language = pl.get_string_attrib(element, 'language', LANGUAGE_DEFAULT)
    field = pl.get_string_attrib(element, 'field', FIELD_DEFAULT)
    prompt = pl.get_string_attrib(element, 'prompt', PROMPT_DEFAULT)

    feedback = data['feedback'].get(field, None)

    if feedback and language == 'markdown':
        feedback = markdown.markdown(feedback, output_format='html5')

    html_params = {
        'prompt': prompt,
        'feedback': feedback
    }
    with open('pl-feedback.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
