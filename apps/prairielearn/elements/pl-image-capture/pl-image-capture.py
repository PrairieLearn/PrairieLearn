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

    submitted_file_name = None
    answer_name_default = f"{answer_name}.png"
    submitted_file_name = answer_name_default if any(file["name"] == answer_name_default for file in submitted_files) else None
        submitted_file_name = answer_name_default

    html_params = {
        "uuid": pl.get_uuid(),
        "answer_name": answer_name,
        "variant_id": data["options"].get("variant_id", ""),
        "submitted_file_name": submitted_file_name,
        "submission_date": data["options"].get("submission_date", ""),
        "submission_files_url": data["options"].get("submission_files_url"),
        "editable": data["editable"],
        "mobile_capture_enabled": mobile_capture_enabled,
    }

    course_id = data["options"].get("course_id")
    course_instance_id = data["options"].get("course_instance_id")
    question_id = data["options"].get("question_id")
    instance_question_id = data["options"].get("instance_question_id")
    server_canonical_host = data["options"].get("serverCanonicalHost")

    if server_canonical_host is None and mobile_capture_enabled:
        raise ValueError(
            "The serverCanonicalHost option must be set to use pl-image-capture."
        )

    if mobile_capture_enabled:
        if course_instance_id is not None and instance_question_id is not None:
            external_image_capture_url = f"{server_canonical_host}/pl/course_instance/{course_instance_id}/instance_question/{instance_question_id}/variants/{html_params['variant_id']}/external_image_capture/answer/{answer_name}"
        elif course_id is not None and question_id is not None:
            external_image_capture_url = f"{server_canonical_host}/pl/course/{course_id}/question/{question_id}/variants/{html_params['variant_id']}/external_image_capture/answer/{answer_name}"
        else:
            raise ValueError(
                "Either course_instance_id and instance_question_id or course_id and question_id must be available to use pl-image-capture."
            )
        html_params["external_image_capture_url"] = external_image_capture_url
    else:
        html_params["external_image_capture_url"] = ""

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

    try:
        _, b64_payload = submitted_file_content.split(",", 1)
    except ValueError:
        pl.add_files_format_error(
            data, f"Image submission for {answer_name} has an invalid data URI format."
        )
        return

    pl.add_submitted_file(data, f"{answer_name}.png", b64_payload)
