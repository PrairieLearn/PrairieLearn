import chevron
import lxml.html
import prairielearn as pl


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    pl.check_attribs(
        element,
        required_attribs=["answer-name"],
        optional_attribs=[],
    )

    answer_name = pl.get_string_attrib(element, "answer-name")

    pl.check_answers_names(data, answer_name)


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)

    answer_name = pl.get_string_attrib(element, "answer-name")

    if data["panel"] != "question":
        return ""

    submitted_files = data["submitted_answers"].get("_files", [])
    submitted_file_name = None

    if len(submitted_files) > 0:
        for file in submitted_files:
            if file["name"] == f"{answer_name}.png":
                submitted_file_name = file["name"]
                break

    html_params = {
        "answer_name": answer_name,
        "variant_id": data["options"].get("variant_id", ""),
        "submitted_file_name": submitted_file_name,
        "submission_date": data["options"].get("submission_date", ""),
        "submission_files_url": data["options"].get("submission_files_url", None),
        "uuid": pl.get_uuid(),
    }

    course_id = data["options"].get("course_id", None)
    course_instance_id = data["options"].get("course_instance_id", None)
    question_id = data["options"].get("question_id", None)
    instance_question_id = data["options"].get("instance_question_id", None)

    if course_instance_id is not None and instance_question_id is not None:
        external_image_capture_url = f"{data['options']['serverCanonicalHost']}/pl/course_instance/{course_instance_id}/instance_question/{instance_question_id}/variants/{html_params['variant_id']}/external_image_capture/answer_name/{html_params['answer_name']}"
    elif course_id is not None and question_id is not None:
        external_image_capture_url = f"{data['options']['serverCanonicalHost']}/pl/course/{course_id}/question/{question_id}/variants/{html_params['variant_id']}/external_image_capture/answer_name/{html_params['answer_name']}"
    else:
        raise ValueError(
            "Either course_instance_id and instance_question_id or course_id and question_id must be available to use pl-image-capture."
        )

    html_params["external_image_capture_url"] = external_image_capture_url

    with open("pl-image-capture.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, "answer-name", "1")
    file_content = data["submitted_answers"].get(answer_name, None)

    if file_content is None or file_content == "":
        pl.add_files_format_error(data, f"No image was submitted for {answer_name}.")
        return

    if not file_content.startswith("data:"):
        # not a data-URI, you could choose to fetch the URL or skip
        pl.add_files_format_error(
            data, f"Image submission for {answer_name} is not a data URI."
        )
        return

    # The part after the comma is pure Base-64
    try:
        _, b64_payload = file_content.split(",", 1)
    except ValueError:
        # malformed data URI
        return

    pl.add_submitted_file(data, f"{answer_name}.png", b64_payload)
