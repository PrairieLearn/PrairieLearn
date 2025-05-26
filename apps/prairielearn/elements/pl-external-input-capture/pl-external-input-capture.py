import chevron
import prairielearn as pl


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] != "question":
        return ""
    with open("pl-external-input-capture.mustache", encoding="utf-8") as f:
        return chevron.render(f).strip()
