import os

import lxml.html
import prairielearn as pl

TYPE_DEFAULT = "static"
DIRECTORY_DEFAULT = "clientFilesQuestion"
FORCE_DOWNLOAD_DEFAULT = True


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(
        element,
        required_attribs=["file-name"],
        optional_attribs=["type", "directory", "label", "force-download"],
    )


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)

    # Get file name or raise exception if one does not exist
    file_name = pl.get_string_attrib(element, "file-name")

    # Get type (default is static)
    file_type = pl.get_string_attrib(element, "type", TYPE_DEFAULT)

    # Get directory (default is clientFilesQuestion)
    file_directory = pl.get_string_attrib(element, "directory", DIRECTORY_DEFAULT)

    # Get label (default is file_name)
    file_label = pl.get_string_attrib(element, "label", file_name)

    # Get whether to force a download or open in-browser
    force_download = pl.get_boolean_attrib(
        element, "force-download", FORCE_DOWNLOAD_DEFAULT
    )

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

    # Create and return html
    if force_download:
        return '<a href="' + file_url + '" download>' + file_label + "</a>"
    else:
        return '<a href="' + file_url + '" target="_blank">' + file_label + "</a>"
