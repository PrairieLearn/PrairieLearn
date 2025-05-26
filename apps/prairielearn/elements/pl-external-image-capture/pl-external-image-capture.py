import chevron
import prairielearn as pl


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] != "question":
        return ""

    print("DATA", data)

    html_params = {
        "course_instance_id": 1,
        "instance_question_id": 1,
        "uuid": pl.get_uuid(),
    }

    with open("pl-external-image-capture.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
