import base64
import json
from pathlib import Path

import chevron
import lxml.html
import prairielearn as pl


def prepare(element_html: str, _: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, ["name"], ["width", "height", "file", "file_dir"])


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    with open("pl-excalidraw.mustache", "r", encoding="utf-8") as template:
        drawing_name = pl.get_string_attrib(element, "name")
        initial_content: str = ""

        def load_file_content() -> str:
            file_dir = pl.get_string_attrib(
                element, "file_dir", "client_files_question_path"
            )
            if file_dir not in data["options"]:
                path_suffixes = [
                    key for key in data["options"].keys() if key.endswith("_path")
                ]
                raise RuntimeError(f"{file_dir=} not a valid key ({path_suffixes})")
            file = Path(data["options"][file_dir]) / pl.get_string_attrib(
                element, "file"
            )
            if not file.exists():
                raise RuntimeError(
                    f"Drawing named {drawing_name} at {file} cannot be found"
                )
            return file.read_text(encoding="utf-8")

        match data["panel"]:
            case "answer":
                # Answer must have a file attribute
                if not pl.has_attrib(element, "file") and data["panel"] == "answer":
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
                elif pl.has_attrib(element, "file"):
                    initial_content = load_file_content()
                # Finally, give up and mark it as empty
                else:
                    initial_content = ""
            case "submission":
                initial_content = (
                    data["submitted_answers"].get(drawing_name) or initial_content
                )
            case panel:
                raise RuntimeError(f"Unhandled panel type {panel}")

        content_bytes = json.dumps(
            {
                "read_only": data["panel"] != "question" or not data["editable"],
                "initial_content": initial_content,
            }
        ).encode()
        return chevron.render(
            template,
            {
                "uuid": pl.get_uuid(),
                "name": drawing_name,
                "width": pl.get_string_attrib(element, "width", "100%"),
                "height": pl.get_string_attrib(element, "height", "800px"),
                "metadata": base64.b64encode(content_bytes).decode(),
            },
        )


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    drawing_name = pl.get_string_attrib(element, "name")

    def append_errors(error_msg: str):
        if drawing_name not in data["format_errors"]:
            data["format_errors"][drawing_name] = []
        data["format_errors"][drawing_name] = data["format_errors"][
            drawing_name
        ].append(error_msg)

    if drawing_name not in data["submitted_answers"]:
        append_errors(f"No submission found for pl-excalidraw element {drawing_name}")
    try:
        json.loads(data["submitted_answers"][drawing_name])
    except Exception as e:
        append_errors(f"Invalid drawing submission: {e}")
