import prairielearn as pl
import lxml.html
import chevron


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, [], ["params-name"])

    # Get frontend variables
    html_variables = []

    for child in element:
        if child.tag == "pl-variable":
            pl.check_attribs(child, ["name", "type"], ["description"])

            var_dict = {
                "name": pl.get_string_attrib(child, "name"),
                "type": pl.get_string_attrib(child, "type"),
            }

            if pl.has_attrib(child, "description"):
                var_dict["description"] = pl.get_string_attrib(child, "description")

            html_variables.append(var_dict)

        elif child.tag is lxml.etree.Comment:
            continue

        else:
            raise ValueError(
                f"Tags inside of pl-external-grader-variables must be pl-variable, not '{child.tag}'."
            )

    has_backend_variables = pl.has_attrib(element, "params-name")

    if has_backend_variables and len(html_variables) > 0:
        raise ValueError("Cannot define variables from both backend and frontend")

    # Get backend variables
    backend_variables = []

    if has_backend_variables:
        params_name = pl.get_string_attrib(element, "params-name")
        backend_variables = data["params"][params_name]

    # Make final variables list
    names_user_description = backend_variables + html_variables
    has_names_user_description = len(names_user_description) > 0

    # Show descriptions if any variable has them set
    has_descriptions = any(
        "description" in var_description for var_description in names_user_description
    )

    html_params = {
        "has_descriptions": has_descriptions,
        "names_user_description": names_user_description,
        "has_names_user_description": has_names_user_description,
    }
    with open("pl-external-grader-variables.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
