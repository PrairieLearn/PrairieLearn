import json

import chevron
import lxml.html
import prairielearn as pl

MOBILE_CAPTURE_ENABLED_DEFAULT = False


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    pl.check_attribs(
        element,
        required_attribs=["answer-name"],
        optional_attribs=["mobile-capture-enabled"],
    )

    answer_name = pl.get_string_attrib(element, "answer-name")

    pl.check_answers_names(data, answer_name)


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)

    answer_name = pl.get_string_attrib(element, "answer-name")

    mobile_capture_enabled = pl.get_boolean_attrib(
        element, "mobile-capture-enabled", MOBILE_CAPTURE_ENABLED_DEFAULT
    )

    if data["panel"] != "question":
        return ""

    submitted_files = data["submitted_answers"].get("_files", [])

    answer_name_default = f"{answer_name}.png"
    submitted_file_name = (
        answer_name_default
        if any(file["name"] == answer_name_default for file in submitted_files)
        else None
    )

    html_params = {
        "uuid": pl.get_uuid(),
        "answer_name": answer_name,
        "editable": data["editable"],
        "submission_files_url": data["options"].get("submission_files_url", ""),
        "mobile_capture_enabled": mobile_capture_enabled,
        "external_image_capture_url": data["options"].get(
            "external_image_capture_url", ""
        ),
    }

    image_capture_options = {
        "answer_name": answer_name,
        "variant_id": data["options"].get("variant_id", ""),
        "submitted_file_name": submitted_file_name,
        "submission_date": data["options"].get("submission_date", ""),
        "mobile_capture_enabled": mobile_capture_enabled,
        "editable": html_params["editable"],
        "external_image_capture_url": html_params["external_image_capture_url"],
    }

    html_params["image_capture_options_json"] = json.dumps(image_capture_options)

    with open("pl-image-capture.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, "answer-name")

    submitted_file_content = data["submitted_answers"].get(answer_name, None)

    if not submitted_file_content:
        pl.add_files_format_error(data, f"No image was submitted for {answer_name}.")
        return

    if not submitted_file_content.startswith("data:"):
        pl.add_files_format_error(
            data, f"Image submission for {answer_name} is not a data URI."
        )
        return

    # Validate that the data is a PNG image
    if not submitted_file_content.startswith("data:image/png;base64,"):
        pl.add_files_format_error(
            data, f"Image submission for {answer_name} is not a PNG image."
        )
        return

    try:
        _, b64_payload = submitted_file_content.split(",", 1)
    except ValueError:
        pl.add_files_format_error(
            data, f"Image submission for {answer_name} has an invalid data URI format."
        )
        return

    pl.add_submitted_file(data, f"{answer_name}.png", b64_payload)
