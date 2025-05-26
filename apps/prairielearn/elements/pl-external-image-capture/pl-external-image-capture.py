import chevron
import prairielearn as pl


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] != "question":
        return ""

    html_params = {
        "uuid": pl.get_uuid(),
    }

    with open("pl-external-image-capture.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
