import prairielearn as pl
import lxml.html
import chevron


VARIABLES_CATEGORY_DEFAULT = None


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, ['variables-category'], [])

    variables_category = pl.get_string_attrib(element, 'variables-category', VARIABLES_CATEGORY_DEFAULT)
    if variables_category is None:
        raise Exception(f'Attribute "variables_category" must not be "None".')

    if variables_category not in data['params']:
        raise Exception(f"Variable category {variables_category} does not exist in data['params'].")


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    variables_category = pl.get_string_attrib(element, 'variables-category', VARIABLES_CATEGORY_DEFAULT)
    names_user_description = data['params'][variables_category]
    has_names_user_description = len(names_user_description) > 0

    html_params = {
        'names_user_description': names_user_description,
        'has_names_user_description': has_names_user_description,
    }
    with open('pl-variable-description.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
