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


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)

    answer_name = pl.get_string_attrib(element, "answer-name", "1")

    if data["panel"] != "question":
        return ""

    html_params = {
        "name": answer_name,
        "course_id": data["options"].get("course_id", ""),
        "course_instance_id": data["options"].get("course_instance_id", ""),
        "question_id": data["options"].get("question_id", ""),
        "instance_question_id": data["options"].get("instance_question_id", ""),
        "variant_id": data["options"].get("variant_id", ""),
        "csrf_token": data["options"].get("csrf_token", ""),
        "uuid": pl.get_uuid(),
    }

    if "instance_question_id" in data["options"]:
        qr_code_url = f"{data['options'].get('serverCanonicalHost')}/pl/course_instance/{html_params['course_instance_id']}/instance_question/{html_params['instance_question_id']}/variants/{html_params['variant_id']}/external_image_capture/answer_name/{html_params['name']}"
    else:
        qr_code_url = f"{data['options'].get('serverCanonicalHost')}/pl/course/{html_params['course_id']}/question/{html_params['question_id']}/variants/{html_params['variant_id']}/external_image_capture/answer_name/{html_params['name']}"

    html_params["qr_code_url"] = qr_code_url

    with open("pl-external-image-capture.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, "answer-name", "1")
    file_content = data["submitted_answers"].get(answer_name, None)

    if file_content is None:
        pl.add_files_format_error(data, "Missing image submission.")
        return

    if not file_content.startswith("data:"):
        # not a data-URI, you could choose to fetch the URL or skip
        pl.add_files_format_error(data, "Image submission is not a data URI.")
        return

    #     # the part after the comma is pure Base-64
    try:
        _, b64_payload = file_content.split(",", 1)
    except ValueError:
        # malformed data URI
        return

    #     print("b64_payload", b64_payload)

    pl.add_submitted_file(data, "preview-image.png", b64_payload)


#     # Validate that the file was present.
