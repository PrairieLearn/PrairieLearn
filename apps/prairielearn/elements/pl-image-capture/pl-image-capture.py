# The pl-image-capture element enables students to submit images to questions using
# their local camera or an external device.

# Neither this element nor its implementation strategy should be copied or forked
# because it is tightly coupled with logic within PrairieLearn's web server.

import base64
import html
import json
import urllib.parse
from io import BytesIO

import chevron
import lxml.html
import prairielearn as pl
from PIL import Image

MOBILE_CAPTURE_ENABLED_DEFAULT = True


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    pl.check_attribs(
        element,
        required_attribs=["file-name"],
        optional_attribs=["mobile-capture-enabled"],
    )

    file_name = pl.get_string_attrib(element, "file-name")
    if not file_name.lower().endswith((".jpg", ".jpeg")):
        pl.add_files_format_error(
            data, f"File '{file_name}' must have extension '.jpg' or '.jpeg'."
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

    external_image_capture_url = data["options"].get("external_image_capture_url")
    external_image_capture_url = (
        f"{external_image_capture_url}?file_name={urllib.parse.quote_plus(file_name)}"
        if external_image_capture_url
        else None
    )

    if data["ai_grading"]:
        if data["panel"] == "question":
            return ""

        uuid = html.escape(pl.get_uuid())
        name = html.escape(file_name)

        # The AI grading rendering process will recursively strip any nodes that
        # don't contain text. Usually this is fine, but in this case this node
        # really only serves to provide a filename and data attribute for the
        # AI grading system to pick up on.
        #
        # To avoid this node being stripped, we just include the filename as text.
        return f'<div data-image-capture-uuid="{uuid}" data-file-name="{name}">{name}</div>'

    html_params = {
        "uuid": pl.get_uuid(),
        "file_name": file_name,
        "editable": data["editable"] and data["panel"] == "question",
        "mobile_capture_enabled": mobile_capture_enabled,
    }

    image_capture_options = {
        "file_name": file_name,
        "variant_id": data["options"].get("variant_id"),
        "submitted_file_name": submitted_file_name,
        "submission_files_url": data["options"].get("submission_files_url"),
        "mobile_capture_enabled": mobile_capture_enabled,
        "editable": html_params["editable"],
        "external_image_capture_url": external_image_capture_url,
        "external_image_capture_available": external_image_capture_url is not None,
    }

    html_params["image_capture_options_json"] = json.dumps(image_capture_options)

    with open("pl-image-capture.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    file_name = pl.get_string_attrib(element, "file-name")

    # On submission, the captured image is stored directly in submitted_answers.
    # Later, we will move the image to submitted_answers["_files"], and pop
    # submitted_answers[file_name].
    submitted_file_content = data["submitted_answers"].get(file_name)

    if not submitted_file_content:
        pl.add_files_format_error(data, f"No image was submitted for {file_name}.")
        return

    if not submitted_file_content.startswith("data:"):
        pl.add_files_format_error(
            data, f"Image submission for {file_name} is not a data URI."
        )
        return

    _, b64_payload = submitted_file_content.split(",", 1)

    try:
        img = Image.open(BytesIO(base64.b64decode(b64_payload)))
        img.load()
    except Exception:
        pl.add_files_format_error(
            data,
            f"Failed to load submission for {file_name}. It may not be a valid image.",
        )
        return

    # Images submitted are expected to be in JPEG format. This is a safeguard to
    # ensure that all images uploaded are ultimately stored as JPEGs.
    if img.format != "JPEG":
        # Attempt to convert the image to JPEG format.
        try:
            jpeg_buffer = BytesIO()
            rgb_img = img.convert("RGB")
            rgb_img.save(jpeg_buffer, format="JPEG")
            jpeg_bytes = jpeg_buffer.getvalue()
            b64_payload = base64.b64encode(jpeg_bytes).decode("utf-8")
        except Exception:
            pl.add_files_format_error(
                data,
                f"Image submission for {file_name} is not a JPEG image and could not be converted to one.",
            )
            return

    # We store the captured base64-encoded image data in _files
    # to prevent it from appearing in assessment instance logs.
    pl.add_submitted_file(data, file_name, b64_payload)

    # We then remove the captured image from submitted_answers. Also, in older versions of image capture,
    # the image file was stored directly in submitted_answers. Popping file_name ensures backwards
    # compatibility for older submissions that saved the file to submitted_answers[file_name]
    data["submitted_answers"].pop(file_name, None)


def test(element_html: str, data: pl.ElementTestData) -> None:
    result = data["test_type"]

    file_name = pl.get_string_attrib(
        lxml.html.fragment_fromstring(element_html), "file-name"
    )

    if result in ["correct", "incorrect"]:
        # Create a 1x1 white RGB image to simulate a valid JPEG image.
        img = Image.new("RGB", (1, 1), color="white")
        img.putpixel((0, 0), (255, 255, 255))

        buffer = BytesIO()
        img.save(buffer, format="JPEG")
        jpeg_bytes = buffer.getvalue()

        b64_payload = base64.b64encode(jpeg_bytes).decode("utf-8")

        data["raw_submitted_answers"][file_name] = (
            f"data:image/jpeg;base64,{b64_payload}"
        )

    elif result == "invalid":
        data["raw_submitted_answers"][file_name] = ""

        if "_files" not in data["format_errors"]:
            data["format_errors"]["_files"] = []

        data["format_errors"]["_files"].append(
            f"No image was submitted for {file_name}."
        )
