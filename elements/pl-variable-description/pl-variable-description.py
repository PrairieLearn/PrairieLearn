import prairielearn as pl
import lxml.html
import chevron


VARIABLES_CATEGORY_DEFAULT = None


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, ['variables-category'], [])

    variables_category = pl.get_string_attrib(element, 'variables-category', VARIABLES_CATEGORY_DEFAULT)
    if variables_category is not None and variables_category not in ['names_for_user', 'names_from_user']:
        raise Exception(f'Unknown variable category: "{variables_category}". Must be one of {",".join(["names_for_user", "names_from_user"])}')


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    variables_category = pl.get_string_attrib(element, 'variables-category', VARIABLES_CATEGORY_DEFAULT)
    names_user_description = data['params'][variables_category]

    has_names_user_description = False
    if names_user_description:
        has_names_user_description = True

    html_params = {
        'names_user_description': names_user_description,
        'has_names_user_description': has_names_user_description,
    }
    with open('pl-variable-description.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
