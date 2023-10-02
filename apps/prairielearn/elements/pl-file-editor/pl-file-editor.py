import base64
import hashlib
import os
import xml.etree.ElementTree as ET
import chevron
import lxml.html
import prairielearn as pl
from text_unidecode import unidecode

EDITOR_CONFIG_FUNCTION_DEFAULT = None
ACE_MODE_DEFAULT = None
ACE_THEME_DEFAULT = None
FONT_SIZE_DEFAULT = None
SOURCE_FILE_NAME_DEFAULT = None
MIN_LINES_DEFAULT = None
MAX_LINES_DEFAULT = None
AUTO_RESIZE_DEFAULT = True
PREVIEW_DEFAULT = None
FOCUS_DEFAULT = False
DIRECTORY_DEFAULT = "."
NORMALIZE_TO_ASCII_DEFAULT = False

def categorize_options(element: lxml.html.HtmlElement, data: pl.QuestionData) -> tuple[bool, list[list[int]], str]:
    hasRange = False
    file_contents = []
    range_list = []
    line = 0 # keeps track of what line in the editor we are in

    for child in element:
        child_html = pl.inner_html(child)
        if child_html[-1] != "\n":
            child_html += "\n"
        file_contents.append(child_html)
        new_lines = child_html.count("\n")    
        
        if child.tag in ["static"]:
            startRow = line 
            endRow = line + max(0, new_lines - 1)
            range_list.append([startRow, endRow])

        if child_html[-1] != "\n":
           line += 1    

        line += new_lines
    
    if len(range_list) != 0:
        hasRange = True

    return hasRange, range_list, "".join(file_contents)

def get_answer_name(file_name: str) -> None:
    return "_file_editor_{0}".format(
        hashlib.sha1(file_name.encode("utf-8")).hexdigest()
    )


def add_format_error(data: pl.QuestionData, error_string: str) -> None:
    if "_files" not in data["format_errors"]:
        data["format_errors"]["_files"] = []
    data["format_errors"]["_files"].append(error_string)


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["file-name"]
    optional_attribs = [
        "ace-mode",
        "ace-theme",
        "font-size",
        "editor-config-function",
        "source-file-name",
        "min-lines",
        "max-lines",
        "auto-resize",
        "preview",
        "focus",
        "directory",
        "normalize-to-ascii",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)
    source_file_name = pl.get_string_attrib(
        element, "source-file-name", SOURCE_FILE_NAME_DEFAULT
    )

    file_name = pl.get_string_attrib(element, "file-name")
    if "_required_file_names" not in data["params"]:
        data["params"]["_required_file_names"] = []
    elif file_name in data["params"]["_required_file_names"]:
        raise Exception("There is more than one file editor with the same file name.")
    data["params"]["_required_file_names"].append(file_name)

    if source_file_name is not None:
        if (element.text is not None and not str(element.text).isspace()) or ("<static>" in element_html or "<editable" in element_html):
            raise Exception(
                'Existing code cannot be added inside html element when "source-file-name" attribute is used.'
            )


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] != "question":
        return ""

    element = lxml.html.fragment_fromstring(element_html)
    file_name = pl.get_string_attrib(element, "file-name", "")
    answer_name = get_answer_name(file_name)
    editor_config_function = pl.get_string_attrib(
        element, "editor-config-function", EDITOR_CONFIG_FUNCTION_DEFAULT
    )
    ace_mode = pl.get_string_attrib(element, "ace-mode", ACE_MODE_DEFAULT)
    ace_theme = pl.get_string_attrib(element, "ace-theme", ACE_THEME_DEFAULT)
    font_size = pl.get_string_attrib(element, "font-size", FONT_SIZE_DEFAULT)
    uuid = pl.get_uuid()
    source_file_name = pl.get_string_attrib(
        element, "source-file-name", SOURCE_FILE_NAME_DEFAULT
    )
    directory = pl.get_string_attrib(element, "directory", DIRECTORY_DEFAULT)
    min_lines = pl.get_integer_attrib(element, "min-lines", MIN_LINES_DEFAULT)
    max_lines = pl.get_integer_attrib(element, "max-lines", MAX_LINES_DEFAULT)
    auto_resize = pl.get_boolean_attrib(element, "auto-resize", AUTO_RESIZE_DEFAULT)
    preview = pl.get_string_attrib(element, "preview", PREVIEW_DEFAULT)
    focus = pl.get_boolean_attrib(element, "focus", FOCUS_DEFAULT)

    # stringify boolean attributes (needed when written to html_params)
    auto_resize = "true" if auto_resize else "false"
    focus = "true" if focus else "false"

    # If auto_resize is set but min_lines isn't, the height of the
    # file editor area will be set to 1 line. Thus, we need to set
    # a default of about 18 lines to match an editor window without
    # the auto resizing enabled.
    if min_lines is None and auto_resize == "true":
        min_lines = 18

    html_params = {
        "name": answer_name,
        "file_name": file_name,
        "ace_mode": ace_mode,
        "ace_theme": ace_theme,
        "font_size": font_size,
        "editor_config_function": editor_config_function,
        "min_lines": min_lines,
        "max_lines": max_lines,
        "auto_resize": auto_resize,
        "preview": preview,
        "read_only": "false" if data["editable"] else "true",
        "uuid": uuid,
        "focus": focus,
    }

    ranges = []
    hasRanges = False

    if source_file_name is not None:
        if directory == "serverFilesCourse":
            directory = data["options"]["server_files_course_path"]
        elif directory == "clientFilesCourse":
            directory = data["options"]["client_files_course_path"]
        else:
            directory = os.path.join(data["options"]["question_path"], directory)
        file_path = os.path.join(directory, source_file_name)
        text_display = open(file_path).read()

        #check if the file provided should be a static editor
        if "<static>" in text_display:
            hasRanges, ranges, text_display = categorize_options(ET.fromstring("<html>" + text_display + "</html>"), data)             #allows us to parse as XML with <html> as root node
    else:
        if element_html is not None:
            if "<static>" in element_html:
                hasRanges, ranges, text_display = categorize_options(element, data)
            else:
                text_display = str(element.text)
        else:
            text_display = ""

    html_params["range_flag"] = str(hasRanges)
    html_params["ranges"] = ranges
    html_params["original_file_contents"] = base64.b64encode(
        text_display.encode("UTF-8").strip()
    ).decode()

    submitted_files = data["submitted_answers"].get("_files", [])
    submitted_file_contents = [
        f.get("contents", None)
        for f in submitted_files
        if f.get("name", None) == file_name
    ]
    if submitted_file_contents:
        html_params["current_file_contents"] = submitted_file_contents[0]
    else:
        html_params["current_file_contents"] = html_params["original_file_contents"]

    if data["panel"] == "question":
        html_params["question"] = True
        with open("pl-file-editor.mustache", "r", encoding="utf-8") as f:
            html = chevron.render(f, html_params).strip()
    else:
        html = ""

    return html


def parse(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    file_name = pl.get_string_attrib(element, "file-name", "")
    answer_name = get_answer_name(file_name)
    normalize_to_ascii = pl.get_boolean_attrib(
        element, "normalize-to-ascii", NORMALIZE_TO_ASCII_DEFAULT
    )

    # Get submitted answer or return parse_error if it does not exist
    file_contents = data["submitted_answers"].get(answer_name, None)
    if not file_contents:
        add_format_error(data, "No submitted answer for {0}".format(file_name))
        return

    # We will store the files in the submitted_answer["_files"] key,
    # so delete the original submitted answer format to avoid
    # duplication
    del data["submitted_answers"][answer_name]

    if normalize_to_ascii:
        try:
            decoded_contents = base64.b64decode(file_contents).decode("utf-8")
            normalized = unidecode(decoded_contents)
            file_contents = base64.b64encode(
                normalized.encode("UTF-8").strip()
            ).decode()
            data["submitted_answers"][answer_name] = file_contents
        except UnicodeError:
            add_format_error(data, "Submitted answer is not a valid UTF-8 string.")

    if data["submitted_answers"].get("_files", None) is None:
        data["submitted_answers"]["_files"] = []
        data["submitted_answers"]["_files"].append(
            {"name": file_name, "contents": file_contents}
        )
    elif isinstance(data["submitted_answers"].get("_files", None), list):
        data["submitted_answers"]["_files"].append(
            {"name": file_name, "contents": file_contents}
        )
    else:
        add_format_error(data, "_files was present but was not an array.")
