import lxml
import prairielearn as pl
import chevron
import os
import copy

#TODO change this into an enum and use enum getter
PARENT_DIRECTORY_CHOICE_DEFAULT = "server_files_course_path"

SUBDIRECTORY_DEFAULT = ""
WARN_UNDEFINED_DEFAULT = True


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["file-name"]
    optional_attribs = ["subdirectory", "parent-directory", "warn-undefined"]
    pl.check_attribs(element, required_attribs, optional_attribs)

    # Load in entries from data dict. Allows filling templates with entries from data['params'] for example.
    variable_dict = copy.deepcopy(data)

    for child in element:
        if child.tag == "pl-variable":
            pl.check_attribs(child, ["name"], ["file-name", "subdirectory", "parent-directory"])

            name = pl.get_string_attrib(child, "name")

            if name in variable_dict:
                raise ValueError(f"Duplicate pl-template variable name: {name}")

            inner_html = pl.inner_html(child)
            has_template_file = pl.has_attrib(child, "file-name")

            if inner_html and has_template_file:
                raise ValueError(
                    f"pl-variable {name} must have at most one of file-name or its inner html defined"
                )

            elif has_template_file:
                variable_file_name = pl.get_string_attrib(child, "file-name")
                # Default parent directory and subdirectory to what's defined in the outer template.
                # TODO maybe change the defaults? Could be confusing, and may not save that much writing on the frontend
                variable_subdirectory = pl.get_string_attrib(child, "subdirectory", SUBDIRECTORY_DEFAULT)
                variable_parent_directory_choice = pl.get_string_attrib(child, "parent-directory", PARENT_DIRECTORY_CHOICE_DEFAULT)

                variable_parent_directory = data["options"][variable_parent_directory_choice]

                file_path = os.path.join(
                    variable_parent_directory, variable_subdirectory, variable_file_name
                )

                with open(file_path, "r") as f:
                    variable_dict[name] = f.read()

            else:
                variable_dict[name] = inner_html

        elif child.tag is lxml.etree.Comment:
            continue

        else:
            raise ValueError(
                f"Tags inside of pl-template must be pl-variable, not '{child.tag}'."
            )

    parent_directory_choice = pl.get_string_attrib(element, "parent-directory", PARENT_DIRECTORY_CHOICE_DEFAULT)

    parent_directory = data["options"][parent_directory_choice]

    subdirectory = pl.get_string_attrib(element, "subdirectory", SUBDIRECTORY_DEFAULT)

    file_name = pl.get_string_attrib(element, "file-name")
    warn_undefined = pl.get_string_attrib(element, "warn-undefined", WARN_UNDEFINED_DEFAULT)


    file_path = os.path.join(parent_directory, subdirectory, file_name)

    with open(file_path, "r") as f:
        return chevron.render(f, variable_dict, warn=warn_undefined)
