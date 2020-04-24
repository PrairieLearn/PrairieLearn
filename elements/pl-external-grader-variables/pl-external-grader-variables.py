import prairielearn as pl
import lxml.html
import chevron


VARIABLES_NAME_DEFAULT = None


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, ['variables-name'], [])

    variables_name = pl.get_string_attrib(element, 'variables-name', VARIABLES_NAME_DEFAULT)
    if variables_name is None:
        raise Exception(f'Attribute "variables-name" is not defined.')
    if variables_name not in data['params']:
        raise Exception(f"Variable name {variables_name} does not exist in data['params'].")


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    variables_name = pl.get_string_attrib(element, 'variables-name', VARIABLES_NAME_DEFAULT)
    names_user_description = data['params'][variables_name]
    has_names_user_description = len(names_user_description) > 0

    html_params = {
        'names_user_description': names_user_description,
        'has_names_user_description': has_names_user_description,
    }
    with open('pl-external-grader-variables.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
