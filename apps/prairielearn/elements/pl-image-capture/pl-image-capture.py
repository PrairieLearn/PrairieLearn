# The pl-image-capture element enables students to submit images to questions using
# their local camera or an external device.

# Neither this element nor its implementation strategy should be copied or forked
# because it is tightly coupled with logic within PrairieLearn's web server.

import json

import chevron
import lxml.html
import prairielearn as pl

MOBILE_CAPTURE_ENABLED_DEFAULT = False


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    pl.check_attribs(
        element,
        required_attribs=["file-name"],
        optional_attribs=["mobile-capture-enabled"],
    )

    file_name = pl.get_string_attrib(element, "file-name")
    if not file_name.endswith(".png"):
        pl.add_files_format_error(
            data, f"File name '{file_name}' must end with '.png'."
        )

    pl.check_answers_names(data, file_name)


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] == "answer":
        return ""

    element = lxml.html.fragment_fromstring(element_html)

    file_name = pl.get_string_attrib(element, "file-name")

    mobile_capture_enabled = pl.get_boolean_attrib(
        element, "mobile-capture-enabled", MOBILE_CAPTURE_ENABLED_DEFAULT
    )

    submitted_files = data["submitted_answers"].get("_files", [])

    submitted_file_name = (
        file_name
        if any(file["name"] == file_name for file in submitted_files)
        else None
    )

    html_params = {
        "uuid": pl.get_uuid(),
        "variant_id": data["options"].get("variant_id", ""),
        "submitted_file_name": submitted_file_name,
        "submission_date": data["options"].get("submission_date", ""),
        "submission_files_url": data["options"].get("submission_files_url"),
        "editable": data["editable"] and data["panel"] == "question",
        "file_name": file_name,
        "mobile_capture_enabled": mobile_capture_enabled,
    }

    external_image_capture_url = data["options"].get("external_image_capture_url")
    if not external_image_capture_url:
        pl.add_files_format_error(
            data,
            "external_image_capture_url was not generated for the image capture question.",
        )

    external_image_capture_url = f"{external_image_capture_url}?file_name={file_name}"

    image_capture_options = {
        "file_name": file_name,
        "variant_id": data["options"].get("variant_id", ""),
        "submitted_file_name": submitted_file_name,
        "submission_date": data["options"].get("submission_date", ""),
        "mobile_capture_enabled": mobile_capture_enabled,
        "editable": html_params["editable"],
        "external_image_capture_url": external_image_capture_url,
    }

    html_params["image_capture_options_json"] = json.dumps(image_capture_options)

    with open("pl-image-capture.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    file_name = pl.get_string_attrib(element, "file-name")

    submitted_file_content = data["submitted_answers"].get(file_name, None)

    if not submitted_file_content:
        pl.add_files_format_error(data, f"No image was submitted for {file_name}.")
        return

    if not submitted_file_content.startswith("data:"):
        pl.add_files_format_error(
            data, f"Image submission for {file_name} is not a data URI."
        )
        return

    # Confirm that the data URI is a PNG image.
    if not submitted_file_content.startswith("data:image/png;base64,"):
        pl.add_files_format_error(
            data, f"Image submission for {file_name} is not a PNG image."
        )
        return

    try:
        _, b64_payload = submitted_file_content.split(",", 1)
    except ValueError:
        pl.add_files_format_error(
            data, f"Image submission for {file_name} has an invalid data URI format."
        )
        return

    pl.add_submitted_file(data, file_name, b64_payload)
