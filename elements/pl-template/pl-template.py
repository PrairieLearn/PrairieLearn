import lxml
import prairielearn as pl
import chevron
import os


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["file-name"]
    optional_attribs = ["subdirectory"]
    pl.check_attribs(element, required_attribs, optional_attribs)

    subdirectory = pl.get_string_attrib(element, "subdirectory")
    server_files_course_path = data["options"]["server_files_course_path"]

    variable_dict = dict()

    for child in element:
        if child.tag == "pl-variable":
            pl.check_attribs(child, ["name"], ["file-name"])

            name = pl.get_string_attrib(child, "name")

            if name in variable_dict:
                raise ValueError(f"Duplicate pl-template variable name: {name}")

            inner_html = child.text
            has_template_file = pl.has_attrib(child, "file-name")

            if (inner_html is not None) and has_template_file:
                raise ValueError(
                    f"pl-variable {name} must have at most one of file-name or its inner html defined"
                )

            elif has_template_file:
                file_name = pl.get_string_attrib(child, "file-name")
                file_path = os.path.join(
                    server_files_course_path, subdirectory, file_name
                )

                with open(file_path, "r") as f:
                    variable_dict[name] = chevron.render(f, variable_dict, warn=True)

            else:
                variable_dict[name] = inner_html

        elif child.tag is lxml.etree.Comment:
            continue

        else:
            raise ValueError(
                f"Tags inside of pl-template must be pl-variable, not '{child.tag}'."
            )

    file_name = pl.get_string_attrib(element, "file-name")
    file_path = os.path.join(server_files_course_path, subdirectory, file_name)

    with open(file_path, "r") as f:
        return chevron.render(f, variable_dict, warn=True)
