import chevron
import lxml.html
import prairielearn as pl

PARAMS_NAME_DEFAULT = None


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, ["params-name"], [])

    params_name = pl.get_string_attrib(element, "params-name", PARAMS_NAME_DEFAULT)
    if params_name is None:
        raise Exception('Attribute "params-name" is not defined.')
    if params_name not in data["params"]:
        raise Exception(
            f"Variable name {params_name} does not exist in data['params']."
        )


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    params_name = pl.get_string_attrib(element, "params-name", PARAMS_NAME_DEFAULT)
    names_user_description = data["params"][params_name]
    has_names_user_description = len(names_user_description) > 0

    html_params = {
        "names_user_description": names_user_description,
        "has_names_user_description": has_names_user_description,
    }
    with open("pl-external-grader-variables.mustache", "r", encoding="utf-8") as f:
        html = chevron.render(f, html_params).strip()

    return html
