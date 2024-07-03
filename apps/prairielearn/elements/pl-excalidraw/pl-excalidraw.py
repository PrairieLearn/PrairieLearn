import base64
import json
from enum import Enum
from pathlib import Path

import chevron
import lxml.html
import prairielearn as pl
from typing_extensions import assert_never


class Attr(Enum):
    ANSWER_NAME = "answers-name"
    WIDTH = "width"
    HEIGHT = "height"
    SOURCE_FILE_NAME = "source-file-name"
    SOURCE_DIRECTORY = "directory"

    @staticmethod
    def required():
        return [Attr.ANSWER_NAME.value]

    @staticmethod
    def optional():
        return [
            Attr.WIDTH.value,
            Attr.HEIGHT.value,
            Attr.SOURCE_FILE_NAME.value,
            Attr.SOURCE_DIRECTORY.value,
        ]


class SourceDirectory(Enum):
    SERVER_FILES_COURSE = "serverFilesCourse"
    CLIENT_FILES_COURSE = "clientFilesCourse"
    CLIENT_FILES_QUESTION = "clientFilesQuestion"
    COURSE_EXTENSIONS = "courseExtensions"
    CURRENT_DIR = "."

    @staticmethod
    def validate(name: str):
        if not any([name in e.value for e in SourceDirectory]):
            raise RuntimeError(f"Unknown source directory: {name}")

    @staticmethod
    def default():
        return SourceDirectory.CURRENT_DIR

    @staticmethod
    def as_runtime_path(s: str):
        match SourceDirectory(s):
            case SourceDirectory.SERVER_FILES_COURSE:
                return "server_files_course_path"
            case SourceDirectory.CLIENT_FILES_COURSE:
                return "client_files_course_path"
            case SourceDirectory.CURRENT_DIR:
                return "question_path"
            case SourceDirectory.CLIENT_FILES_QUESTION:
                return "client_files_question_path"
            case SourceDirectory.COURSE_EXTENSIONS:
                return "course_extensions_path"
            case item:
                assert_never(item)


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, Attr.required(), Attr.optional())

    name = pl.get_string_attrib(element, Attr.ANSWER_NAME.value)
    pl.check_answers_names(data, name)

    SourceDirectory.validate(
        pl.get_string_attrib(
            element, Attr.SOURCE_DIRECTORY.value, SourceDirectory.default().value
        )
    )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    drawing_name = pl.get_string_attrib(element, Attr.ANSWER_NAME.value)
    initial_content: str = ""

    def load_file_content() -> str:
        file_dir = SourceDirectory.as_runtime_path(
            pl.get_string_attrib(
                element,
                Attr.SOURCE_DIRECTORY.value,
                SourceDirectory.default().value,
            )
        )
        file = Path(data["options"][file_dir]) / pl.get_string_attrib(
            element, Attr.SOURCE_FILE_NAME.value
        )
        if not file.exists():
            raise RuntimeError(f"Unknown file path: {file}")
        return file.read_text(encoding="utf-8")

    match data["panel"]:
        case "answer":
            # Answer must have a file attribute
            if not pl.has_attrib(element, Attr.SOURCE_FILE_NAME.value):
                raise RuntimeError(
                    f"Answer drawing '{drawing_name}' does not have a `file` argument"
                )
            initial_content = load_file_content()
        case "question":
            # First try loading the submission
            if drawing_name in data["submitted_answers"]:
                initial_content = (
                    data["submitted_answers"].get(drawing_name) or initial_content
                )
            # Next, try using the file attribute to load the starter diagram
            elif pl.has_attrib(element, Attr.SOURCE_FILE_NAME.value):
                initial_content = load_file_content()
            # Finally, give up and mark it as empty
            else:
                initial_content = ""
        case "submission":
            initial_content = (
                data["submitted_answers"].get(drawing_name) or initial_content
            )
        case panel:
            assert_never(panel)

    content_bytes = json.dumps(
        {
            "read_only": data["panel"] != "question" or not data["editable"],
            "initial_content": initial_content,
            "width": pl.get_string_attrib(element, Attr.WIDTH.value, "100%"),
            "height": pl.get_string_attrib(element, Attr.HEIGHT.value, "800px"),
        }
    ).encode()

    errors = (
        data["format_errors"].get(drawing_name, [])
        if data["panel"] == "submission"
        else []
    )

    with open("pl-excalidraw.mustache", "r", encoding="utf-8") as template:
        return chevron.render(
            template,
            {
                "uuid": pl.get_uuid(),
                "name": drawing_name,
                "metadata": base64.b64encode(content_bytes).decode(),
                "errors": errors,
            },
        )


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    drawing_name = pl.get_string_attrib(element, Attr.ANSWER_NAME.value)

    try:
        # Only check submissions if present. When one makes a submission using pl-excalidraw,
        # we always save a valid answer for all pl-excalidraw elements rendered in the question.
        # There might however be a standalone element inside pl-answer-panel without a submission;
        # it is okay to ignore them.
        if drawing_name in data["submitted_answers"]:
            json.loads(data["submitted_answers"][drawing_name])
    except Exception as e:
        if drawing_name not in data["format_errors"]:
            data["format_errors"][drawing_name] = []
        data["format_errors"][drawing_name].append(f"Invalid drawing submission: {e}")
