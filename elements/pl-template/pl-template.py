import copy
import os
from enum import Enum
from typing import Any, Dict, cast

import chevron
import lxml
import prairielearn as pl


class ParentDirectoryEnum(Enum):
    QUESTION = "question_path"
    CLIENT_FILES_QUESTION = "client_files_question_path"
    CLIENT_FILES_COURSE = "client_files_course_path"
    SERVER_FILES_COURSE = "server_files_course_path"
    COURSE_EXTENSIONS = "course_extensions_path"


PARENT_DIRECTORY_CHOICE_DEFAULT = ParentDirectoryEnum.SERVER_FILES_COURSE
SUBDIRECTORY_DEFAULT = ""
WARN_UNDEFINED_DEFAULT = True
TRIM_WHITESPACE_DEFAULT = True


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["file-name"]
    optional_attribs = ["subdirectory", "parent-directory", "warn-undefined"]
    pl.check_attribs(element, required_attribs, optional_attribs)

    # Load in entries from data dict. Allows filling templates with entries from data['params'], for example.
    variable_dict = cast(Dict[str, Any], copy.deepcopy(data))
    options_dict = data["options"]

    for child in element:
        if child.tag == "pl-variable":
            pl.check_attribs(
                child,
                ["name"],
                ["file-name", "subdirectory", "parent-directory", "trim-whitespace"],
            )

            name = pl.get_string_attrib(child, "name")

            if name in variable_dict:
                raise ValueError(f'Duplicate pl-template variable name: "{name}"')

            inner_html = pl.inner_html(child)
            has_template_file = pl.has_attrib(child, "file-name")

            if inner_html and has_template_file:
                raise ValueError(
                    f'pl-variable "{name}" must have at most one of file-name or its inner html defined'
                )

            elif has_template_file:
                variable_file_name = pl.get_string_attrib(child, "file-name")
                # Default parent directory and subdirectory to what's defined in the outer template.
                # TODO maybe change the defaults? Could be confusing, and may not save that much writing on the frontend
                variable_subdirectory = pl.get_string_attrib(
                    child, "subdirectory", SUBDIRECTORY_DEFAULT
                )

                variable_parent_directory_choice = pl.get_enum_attrib(
                    child,
                    "parent-directory",
                    ParentDirectoryEnum,
                    PARENT_DIRECTORY_CHOICE_DEFAULT,
                )

                variable_parent_directory = options_dict[
                    variable_parent_directory_choice.value
                ]

                file_path = os.path.join(
                    variable_parent_directory, variable_subdirectory, variable_file_name
                )

                with open(file_path, "r") as f:
                    variable_dict[name] = f.read()

            else:
                variable_dict[name] = inner_html

            if pl.get_boolean_attrib(child, "trim-whitespace", TRIM_WHITESPACE_DEFAULT):
                variable_dict[name] = variable_dict[name].strip()

        elif child.tag is lxml.etree.Comment:
            continue

        else:
            raise ValueError(
                f'Tags inside of pl-template must be pl-variable, not "{child.tag}".'
            )

    parent_directory_choice = pl.get_enum_attrib(
        element,
        "parent-directory",
        ParentDirectoryEnum,
        PARENT_DIRECTORY_CHOICE_DEFAULT,
    )
    parent_directory = options_dict[parent_directory_choice.value]

    subdirectory = pl.get_string_attrib(element, "subdirectory", SUBDIRECTORY_DEFAULT)

    file_name = pl.get_string_attrib(element, "file-name")
    warn_undefined = pl.get_boolean_attrib(
        element, "warn-undefined", WARN_UNDEFINED_DEFAULT
    )

    file_path = os.path.join(parent_directory, subdirectory, file_name)

    with open(file_path, "r") as f:
        return chevron.render(f, variable_dict, warn=warn_undefined)
