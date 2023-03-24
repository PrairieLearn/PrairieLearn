import copy
import os
from itertools import chain
from typing import Any, cast

import chevron
import lxml.etree
import lxml.html
import prairielearn as pl

WARN_UNDEFINED_DEFAULT = False
TRIM_WHITESPACE_DEFAULT = True
VALIDATE_OUTPUT_DEFAULT = True

# These elements should be display only
ALLOWED_PL_TAGS = frozenset(
    ("pl-template", "pl-variable", "pl-code", "pl-card", "markdown")
)


def check_tags(element_html: str) -> None:
    element_list = cast(list, lxml.html.fragments_fromstring(element_html))

    # First element can be a string, remove since there's nothing to check.
    if isinstance(element_list[0], str):
        element_list.pop(0)

    for e in chain.from_iterable(element.iter() for element in element_list):
        if (
            e.tag is not lxml.etree.Comment
            and e.tag.startswith("pl-")
            and e.tag not in ALLOWED_PL_TAGS
        ):
            print(
                f'WARNING: Element "{e.tag}" may not work correctly when used inside of "pl-template" element.'
            )
            print('Set validate-output="False" to disable this warning.')


def get_file_path(data: pl.QuestionData, element: lxml.html.HtmlElement) -> str:
    parent_dir_dict = {
        "question": "question_path",
        "clientFilesQuestion": "client_files_question_path",
        "clientFilesCourse": "client_files_course_path",
        "serverFilesCourse": "server_files_course_path",
        "courseExtensions": "course_extensions_path",
    }

    dir_choice = pl.get_string_attrib(
        element,
        "directory",
        "serverFilesCourse",
    )

    if dir_choice not in parent_dir_dict:
        raise ValueError(f"Invalid directory choice: {dir_choice}")

    file_directory = data["options"][parent_dir_dict[dir_choice]]
    file_name = pl.get_string_attrib(element, "file-name")

    return os.path.join(file_directory, file_name)


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["file-name"]
    optional_attribs = [
        "directory",
        "warn-undefined",
        "validate-output",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    # Load in entries from data dict. Allows filling templates with entries from data['params'].
    variable_dict: dict[str, Any] = {"params": copy.deepcopy(data["params"])}

    for child in element:
        if child.tag == "pl-variable":
            pl.check_attribs(
                child,
                ["name"],
                ["file-name", "directory", "trim-whitespace"],
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
                with open(get_file_path(data, child), "r") as f:
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

    warn_undefined = pl.get_boolean_attrib(
        element, "warn-undefined", WARN_UNDEFINED_DEFAULT
    )

    validate_output = pl.get_boolean_attrib(
        element, "validate-output", VALIDATE_OUTPUT_DEFAULT
    )

    with open(get_file_path(data, element), "r") as f:
        res = chevron.render(f, variable_dict, warn=warn_undefined)

    if validate_output:
        check_tags(res)

    return res
