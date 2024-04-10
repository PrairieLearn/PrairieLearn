import os
from enum import Enum

import lxml.html
import prairielearn as pl
from typing_extensions import assert_never


class FileType(Enum):
    STATIC = 1
    DYNAMIC = 2


FILE_TYPE_DEFAULT = FileType.STATIC
DIRECTORY_DEFAULT = "clientFilesQuestion"
FORCE_DOWNLOAD_DEFAULT = True

DIRECTORY_URL_DICT = {
    "clientFilesQuestion": "client_files_question_url",
    "clientFilesCourse": "client_files_course_url",
}

DIRECTORY_PATH_DICT = {
    "clientFilesQuestion": "client_files_question_path",
    "clientFilesCourse": "client_files_course_path",
}


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(
        element,
        required_attribs=["file-name"],
        optional_attribs=["type", "directory", "label", "force-download"],
    )

    file_type = pl.get_enum_attrib(element, "type", FileType, FILE_TYPE_DEFAULT)

    # If the file is static, validate that it exists on disk
    if file_type is FileType.STATIC:
        file_directory = pl.get_string_attrib(element, "directory", DIRECTORY_DEFAULT)

        if file_directory not in DIRECTORY_PATH_DICT:
            dict_keys = ", ".join(f'"{key}"' for key in DIRECTORY_PATH_DICT.keys())
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

    # Get directory (default is clientFilesQuestion)
    file_directory = pl.get_string_attrib(element, "directory", DIRECTORY_DEFAULT)

    # Get label (default is file_name)
    file_label = pl.get_string_attrib(element, "label", file_name)

    # Get whether to force a download or open in-browser
    force_download = pl.get_boolean_attrib(
        element, "force-download", FORCE_DOWNLOAD_DEFAULT
    )

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

    # Create and return html
    if force_download:
        return f'<a href="{file_url}" download>{file_label}</a>'

    return f'<a href="{file_url}" target="_blank">{file_label}</a>'
