# The pl-image-capture element enables students to submit images to questions using
# their local camera or an external device.

# Neither this element nor its implementation strategy should be copied or forked
# because it is tightly coupled with logic within PrairieLearn's web server.

import base64
import html
import json
import os
import urllib.parse
from io import BytesIO

import chevron
import lxml.html
import prairielearn as pl
from PIL import Image

MOBILE_CAPTURE_ENABLED_DEFAULT = True
MANUAL_UPLOAD_ENABLED_DEFAULT = False
ALLOW_BLANK_DEFAULT = False
MAX_IMAGES_DEFAULT = 1


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    pl.check_attribs(
        element,
        required_attribs=["file-name"],
        optional_attribs=[
            "mobile-capture-enabled",
            "manual-upload-enabled",
            "allow-blank",
            "max-images",
        ],
    )

    file_name = pl.get_string_attrib(element, "file-name")
    if not file_name.lower().endswith((".jpg", ".jpeg")):
        pl.add_files_format_error(
            data, f"File '{file_name}' must have extension '.jpg' or '.jpeg'."
        )

    max_images = pl.get_integer_attrib(element, "max-images", MAX_IMAGES_DEFAULT)
    if max_images < 1:
        raise ValueError(
            f"Attribute 'max-images' must be a positive integer, got {max_images}."
        )

    pl.check_answers_names(data, file_name)

    # Reserve all potential generated file names to prevent cross-element collisions
    if max_images > 1:
        for i in range(1, max_images):
            pl.check_answers_names(data, _get_image_file_name(file_name, i))


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] == "answer":
        return ""

    element = lxml.html.fragment_fromstring(element_html)

    file_name = pl.get_string_attrib(element, "file-name")

    mobile_capture_enabled = pl.get_boolean_attrib(
        element, "mobile-capture-enabled", MOBILE_CAPTURE_ENABLED_DEFAULT
    )

    manual_upload_enabled = pl.get_boolean_attrib(
        element, "manual-upload-enabled", MANUAL_UPLOAD_ENABLED_DEFAULT
    )

    max_images = pl.get_integer_attrib(element, "max-images", MAX_IMAGES_DEFAULT)

    submitted_files = data["submitted_answers"].get("_files", [])

    # Build the list of submitted file names matching this element's naming pattern.
    submitted_file_names = _get_submitted_file_names(
        file_name, max_images, submitted_files
    )

    # For backward compatibility, single-image mode uses a single string or None.
    submitted_file_name = submitted_file_names[0] if submitted_file_names else None

    external_image_capture_url = data["options"].get("external_image_capture_url")
    external_image_capture_url = (
        f"{external_image_capture_url}?file_name={urllib.parse.quote_plus(file_name)}"
        if external_image_capture_url
        else None
    )

    if data["ai_grading"]:
        if data["panel"] == "question":
            return ""

        # The AI grading rendering process will recursively strip any nodes that
        # don't contain text. Usually this is fine, but in this case this node
        # really only serves to provide a filename and data attribute for the
        # AI grading system to pick up on.
        #
        # To avoid this node being stripped, we just include the filename as text.
        parts = []
        for fn in submitted_file_names:
            uuid = html.escape(pl.get_uuid())
            escaped_fn = html.escape(fn)
            parts.append(
                f'<div data-image-capture-uuid="{uuid}" data-file-name="{escaped_fn}">{escaped_fn}</div>'
            )
        return "\n".join(parts)

    html_params = {
        "uuid": pl.get_uuid(),
        "file_name": file_name,
        "editable": data["editable"] and data["panel"] == "question",
        "mobile_capture_enabled": mobile_capture_enabled,
        "manual_upload_enabled": manual_upload_enabled,
        "retake_menu_enabled": mobile_capture_enabled
        or manual_upload_enabled
        or max_images > 1,
    }

    image_capture_options = {
        "file_name": file_name,
        "variant_id": data["options"].get("variant_id"),
        "submitted_file_name": submitted_file_name,
        "submitted_file_names": submitted_file_names,
        "max_images": max_images,
        "submission_files_url": data["options"].get("submission_files_url"),
        "mobile_capture_enabled": mobile_capture_enabled,
        "manual_upload_enabled": manual_upload_enabled,
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
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    max_images = pl.get_integer_attrib(element, "max-images", MAX_IMAGES_DEFAULT)

    # On submission, the captured image is stored directly in submitted_answers.
    # Later, we will move the image to submitted_answers["_files"], and pop
    # submitted_answers[file_name].
    submitted_file_content = data["submitted_answers"].get(file_name)

    if max_images > 1:
        _parse_multi_image(
            data, file_name, submitted_file_content, allow_blank, max_images
        )
    else:
        _parse_single_image(data, file_name, submitted_file_content, allow_blank)


def _parse_single_image(
    data: pl.QuestionData,
    file_name: str,
    submitted_file_content: str | None,
    allow_blank: bool,
) -> None:
    if not submitted_file_content:
        if not allow_blank:
            pl.add_files_format_error(data, f"No image was submitted for {file_name}.")
        data["submitted_answers"].pop(file_name, None)
        return

    b64_payload = _validate_and_convert_image(data, file_name, submitted_file_content)
    if b64_payload is not None:
        pl.add_submitted_file(data, file_name, b64_payload)

    # We remove the captured image from submitted_answers to prevent it from
    # appearing in assessment instance logs.
    data["submitted_answers"].pop(file_name, None)


def _parse_multi_image(
    data: pl.QuestionData,
    file_name: str,
    submitted_file_content: str | None,
    allow_blank: bool,
    max_images: int,
) -> None:
    if not submitted_file_content:
        if not allow_blank:
            pl.add_files_format_error(
                data, f"No images were submitted for {file_name}."
            )
        data["submitted_answers"].pop(file_name, None)
        return

    try:
        image_data_uris: list[str] = json.loads(submitted_file_content)
    except json.JSONDecodeError:
        pl.add_files_format_error(data, f"Invalid image data for {file_name}.")
        data["submitted_answers"].pop(file_name, None)
        return

    if not isinstance(image_data_uris, list):
        pl.add_files_format_error(data, f"Expected array of images for {file_name}.")
        data["submitted_answers"].pop(file_name, None)
        return

    if len(image_data_uris) == 0:
        if not allow_blank:
            pl.add_files_format_error(
                data, f"No images were submitted for {file_name}."
            )
        data["submitted_answers"].pop(file_name, None)
        return

    for i, data_uri in enumerate(image_data_uris[:max_images]):
        if not isinstance(data_uri, str):
            pl.add_files_format_error(
                data, f"Image entry {i + 1} for {file_name} is not a string."
            )
            continue
        current_file_name = _get_image_file_name(file_name, i)
        b64_payload = _validate_and_convert_image(data, current_file_name, data_uri)
        if b64_payload is not None:
            pl.add_submitted_file(data, current_file_name, b64_payload)

    data["submitted_answers"].pop(file_name, None)


def _validate_and_convert_image(
    data: pl.QuestionData,
    file_name: str,
    data_uri: str,
) -> str | None:
    """Validate a data URI as an image and convert to JPEG base64.

    Returns:
        The base64 payload on success, or None if validation fails (format
        errors are added to data).
    """
    if not data_uri or not data_uri.startswith("data:"):
        pl.add_files_format_error(
            data, f"Image submission for {file_name} is not a data URI."
        )
        return None

    _, b64_payload = data_uri.split(",", 1)

    try:
        img = Image.open(BytesIO(base64.b64decode(b64_payload)))
        img.load()
    except Exception:
        pl.add_files_format_error(
            data,
            f"Failed to load submission for {file_name}. It may not be a valid image.",
        )
        return None

    # Images submitted are expected to be in JPEG format. This is a safeguard to
    # ensure that all images uploaded are ultimately stored as JPEGs.
    if img.format != "JPEG":
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
            return None

    return b64_payload


def _get_image_file_name(base_file_name: str, index: int) -> str:
    """Generate a file name for the given image index.

    Index 0 returns the base file name; index N returns '{base}-{N+1}.{ext}'.

    Returns:
        The generated file name.
    """
    if index == 0:
        return base_file_name
    base, ext = os.path.splitext(base_file_name)
    return f"{base}-{index + 1}{ext}"


def _get_submitted_file_names(
    file_name: str, max_images: int, submitted_files: list[dict[str, str]]
) -> list[str]:
    """Return the list of submitted file names matching this element's naming pattern."""
    submitted_names = {f["name"] for f in submitted_files}
    result = []
    for i in range(max_images):
        name = _get_image_file_name(file_name, i)
        if name in submitted_names:
            result.append(name)
    return result


def _make_test_image_data_uri() -> str:
    """Create a 1x1 white JPEG image as a data URI for testing."""
    img = Image.new("RGB", (1, 1), color="white")
    img.putpixel((0, 0), (255, 255, 255))

    buffer = BytesIO()
    img.save(buffer, format="JPEG")
    jpeg_bytes = buffer.getvalue()

    b64_payload = base64.b64encode(jpeg_bytes).decode("utf-8")
    return f"data:image/jpeg;base64,{b64_payload}"


def test(element_html: str, data: pl.ElementTestData) -> None:
    result = data["test_type"]

    element = lxml.html.fragment_fromstring(element_html)
    file_name = pl.get_string_attrib(element, "file-name")
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    max_images = pl.get_integer_attrib(element, "max-images", MAX_IMAGES_DEFAULT)

    if result in ["correct", "incorrect"]:
        if max_images > 1:
            # Submit a JSON array of test image data URIs.
            data_uris = [_make_test_image_data_uri() for _ in range(max_images)]
            data["raw_submitted_answers"][file_name] = json.dumps(data_uris)
        else:
            data["raw_submitted_answers"][file_name] = _make_test_image_data_uri()

    elif result == "invalid":
        if max_images > 1:
            data["raw_submitted_answers"][file_name] = json.dumps([])
        else:
            data["raw_submitted_answers"][file_name] = ""

        if not allow_blank:
            if "_files" not in data["format_errors"]:
                data["format_errors"]["_files"] = []

            error_msg = (
                f"No images were submitted for {file_name}."
                if max_images > 1
                else f"No image was submitted for {file_name}."
            )
            data["format_errors"]["_files"].append(error_msg)
