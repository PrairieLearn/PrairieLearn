import chevron
import lxml.etree
import lxml.html
import prairielearn as pl

EMPTY_DEFAULT = False


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, ["params-name"], ["empty"])

    params_name = pl.get_string_attrib(element, "params-name")

    # Get any variables defined in HTML
    html_variables = []

    for child in element:
        if child.tag == "pl-variable":
            pl.check_attribs(child, ["name", "type"], [])

            var_dict = {
                "name": pl.get_string_attrib(child, "name"),
                "type": pl.get_string_attrib(child, "type"),
                # Use that empty string is returned, won't trigger the description column
                "description": pl.inner_html(child),
            }

            html_variables.append(var_dict)

        elif child.tag is lxml.etree.Comment:
            continue

        else:
            raise ValueError(
                f'Tags inside of pl-external-grader-variables must be pl-variable, not "{child.tag}".'
            )

    declared_empty = pl.get_boolean_attrib(element, "empty", EMPTY_DEFAULT)

    if declared_empty:
        if html_variables:
            raise ValueError(
                f'Variable name "{params_name}" was declared empty, but has variables defined in "question.html".'
            )
        elif params_name in data["params"]:
            raise ValueError(
                f'Variable name "{params_name}" was declared empty, but has variables defined in "server.py".'
            )

        data["params"][params_name] = []
    elif params_name not in data["params"]:
        if not html_variables:
            raise ValueError(
                f'Variable name "{params_name}" has no variables defined in "question.html" or "server.py". '
                "Did you mean to set it to be empty?"
            )

        data["params"][params_name] = html_variables
    else:
        if html_variables:
            raise ValueError(
                f'Cannot define variables from both "question.html" and "server.py" for variable name "{params_name}".'
            )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)

    params_name = pl.get_string_attrib(element, "params-name")

    # Get final variables list
    names_user_description = data["params"][params_name]
    has_names_user_description = len(names_user_description) > 0

    # Show descriptions if any variable has them set (non-empty and not None)
    has_descriptions = any(d.get("description", None) for d in names_user_description)

    html_params = {
        "has_descriptions": has_descriptions,
        "names_user_description": names_user_description,
        "has_names_user_description": has_names_user_description,
    }
    with open("pl-external-grader-variables.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
