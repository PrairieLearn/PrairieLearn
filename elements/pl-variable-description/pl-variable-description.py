import prairielearn as pl
import lxml.html
import chevron


def prepare(element_html, element_index, data):

    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['variables_category']
    optional_attribs = ['']
    pl.check_attribs(element, required_attribs, optional_attribs)
    variables_category = pl.get_string_attrib(element, 'variables_category', None)
    if variables_category is not None:
        if variables_category not in ['names_for_user', 'names_from_user']:
            raise Exception(f'Unknown variable category: "{variables_category}". Must be one of {",".join(["names_for_user", "names_from_user"])}')


def render(element_html, element_index, data):

    element = lxml.html.fragment_fromstring(element_html)
    variables_category = pl.get_string_attrib(element, 'variables_category', None)

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
