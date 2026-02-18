import os
from enum import Enum

import chevron
import lxml.html
import prairielearn as pl
from typing_extensions import assert_never


class FileType(Enum):
    STATIC = 1
    DYNAMIC = 2


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"


WIDTH_DEFAULT = None
FILE_TYPE_DEFAULT = FileType.STATIC
DIRECTORY_DEFAULT = "clientFilesQuestion"
DISPLAY_DEFAULT = DisplayType.BLOCK
ALT_TEXT_DEFAULT = ""


DIRECTORY_URL_DICT = {
    "clientFilesQuestion": "client_files_question_url",
    "clientFilesCourse": "client_files_course_url",
}

DIRECTORY_PATH_DICT = {
    "clientFilesQuestion": "client_files_question_path",
    "clientFilesCourse": "client_files_course_path",
}


def get_display_type(element: lxml.html.HtmlElement) -> DisplayType:
    """Convert external display attribute to internal enum.

    Supports backward compatibility with the deprecated boolean `inline` attribute.

    Args:
        element: The pl-figure HTML element

    Returns:
        DisplayType enum value

    Raises:
        ValueError: If both display and inline attributes are set
    """
    if pl.has_attrib(element, "display") and pl.has_attrib(element, "inline"):
        raise ValueError(
            "Cannot set both 'display' and 'inline' attributes. "
            "Use only 'display'; the 'inline' attribute is deprecated."
        )

    inline_default = False
    inline = pl.get_boolean_attrib(element, "inline", inline_default)
    display_type_default = DisplayType.INLINE if inline else DISPLAY_DEFAULT

    return pl.get_enum_attrib(element, "display", DisplayType, display_type_default)


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(
        element,
        required_attribs=["file-name"],
        optional_attribs=["width", "type", "directory", "inline", "display", "alt"],
    )

    file_type = pl.get_enum_attrib(element, "type", FileType, FILE_TYPE_DEFAULT)

    # If the file is static, validate that it exists on disk
    if file_type is FileType.STATIC:
        file_directory = pl.get_string_attrib(element, "directory", DIRECTORY_DEFAULT)

        if file_directory not in DIRECTORY_PATH_DICT:
            dict_keys = ", ".join(f'"{key}"' for key in DIRECTORY_PATH_DICT)
            raise ValueError(
                f'Invalid directory choice "{file_directory}", must be one of: {dict_keys}.'
            )

        file_name = pl.get_string_attrib(element, "file-name")
        file_path = os.path.join(
            data["options"][DIRECTORY_PATH_DICT[file_directory]], file_name
        )

        # If file not found on server, raise error
        if not os.path.isfile(file_path):
            raise FileNotFoundError(
                f'File "{file_name}" not found in directory "{file_directory}".'
            )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)

    # Get file name or raise exception if one does not exist
    file_name = pl.get_string_attrib(element, "file-name")

    # Get type (default is static)
    file_type = pl.get_enum_attrib(element, "type", FileType, FILE_TYPE_DEFAULT)

    # Get display type (default is block)
    display_type = get_display_type(element)
    inline = display_type is DisplayType.INLINE

    # Get alternate-text text (default is PrairieLearn Image)
    alt_text = pl.get_string_attrib(element, "alt", ALT_TEXT_DEFAULT)

    # Get base url, which depends on the type and directory
    if file_type is FileType.STATIC:
        file_directory = pl.get_string_attrib(element, "directory", DIRECTORY_DEFAULT)
        base_url = data["options"][DIRECTORY_URL_DICT[file_directory]]

    elif file_type is FileType.DYNAMIC:
        if pl.has_attrib(element, "directory"):
            raise ValueError(
                f'Attribute "directory" cannot be provided for type "{file_type}".'
            )

        base_url = data["options"]["client_files_question_dynamic_url"]

    else:
        assert_never(file_type)

    # Get full url
    file_url = os.path.join(base_url, file_name)

    # Get width (optional)
    width = pl.get_string_attrib(element, "width", WIDTH_DEFAULT)

    # Create and return html
    html_params = {"src": file_url, "width": width, "inline": inline, "alt": alt_text}
    with open("pl-figure.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
