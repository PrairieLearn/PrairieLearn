import os

import chevron
import lxml.html
import prairielearn as pl

WIDTH_DEFAULT = None
TYPE_DEFAULT = "static"
DIRECTORY_DEFAULT = "clientFilesQuestion"
INLINE_DEFAULT = False
ALT_TEXT_DEFAULT = ""


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(
        element,
        required_attribs=["file-name"],
        optional_attribs=["width", "type", "directory", "inline", "alt"],
    )


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)

    # Get file name or raise exception if one does not exist
    file_name = pl.get_string_attrib(element, "file-name")

    # Get type (default is static)
    file_type = pl.get_string_attrib(element, "type", TYPE_DEFAULT)

    # Get directory (default is clientFilesQuestion)
    file_directory = pl.get_string_attrib(element, "directory", DIRECTORY_DEFAULT)

    # Get inline (default is false)
    inline = pl.get_boolean_attrib(element, "inline", INLINE_DEFAULT)

    # Get alternate-text text (default is PrairieLearn Image)
    alt_text = pl.get_string_attrib(element, "alt", ALT_TEXT_DEFAULT)

    # Get base url, which depends on the type and directory
    if file_type == "static":
        if file_directory == "clientFilesQuestion":
            base_url = data["options"]["client_files_question_url"]
        elif file_directory == "clientFilesCourse":
            base_url = data["options"]["client_files_course_url"]
        else:
            raise ValueError(
                'directory "{}" is not valid for type "{}" (must be "clientFilesQuestion" or "clientFilesCourse")'.format(
                    file_directory, file_type
                )
            )
    elif file_type == "dynamic":
        if pl.has_attrib(element, "directory"):
            raise ValueError(
                'no directory ("{}") can be provided for type "{}"'.format(
                    file_directory, file_type
                )
            )
        else:
            base_url = data["options"]["client_files_question_dynamic_url"]
    else:
        raise ValueError(
            'type "{}" is not valid (must be "static" or "dynamic")'.format(file_type)
        )

    # Get full url
    file_url = os.path.join(base_url, file_name)

    # Get width (optional)
    width = pl.get_string_attrib(element, "width", WIDTH_DEFAULT)

    # Create and return html
    html_params = {"src": file_url, "width": width, "inline": inline, "alt": alt_text}
    with open("pl-figure.mustache", "r", encoding="utf-8") as f:
        html = chevron.render(f, html_params).strip()

    return html
