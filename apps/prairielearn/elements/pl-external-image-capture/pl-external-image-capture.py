import chevron
import lxml.html
import prairielearn as pl


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    pl.check_attribs(
        element,
        required_attribs=[],
        optional_attribs=["element-id"],
    )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)

    element_id = pl.get_string_attrib(element, "element-id", "1")

    if data["panel"] != "question":
        return ""

    html_params = {
        "variant_id": data["options"].get("variant_id", ""),
        "course_id": data["options"].get("course_id", ""),
        "course_instance_id": data["options"].get("course_instance_id", ""),
        "instance_question_id": data["options"].get("instance_question_id", ""),
        "question_id": data["options"].get("question_id", ""),
        "element_id": element_id,
        "uuid": pl.get_uuid(),
    }

    if "instance_question_id" in data["options"]:
        qr_code_url = f"{data['options'].get('serverCanonicalHost')}/pl/course_instance/{html_params['course_instance_id']}/instance_question/{html_params['instance_question_id']}/variants/{html_params['variant_id']}/external_image_capture/element/{html_params['element_id']}"
    else:
        qr_code_url = f"{data['options'].get('serverCanonicalHost')}/pl/course/{html_params['course_id']}/question/{html_params['question_id']}/variants/{html_params['variant_id']}/external_image_capture/element/{html_params['element_id']}"

    html_params["qr_code_url"] = qr_code_url

    with open("pl-external-image-capture.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
