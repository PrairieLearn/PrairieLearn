import chevron
import lxml.html
import prairielearn as pl


def prepare(element_html, data):
    return data

def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    width = pl.get_integer_attrib(element, "width", 600)
    height = pl.get_integer_attrib(element, "height", 700)

    if data["panel"] != "question":
        return ""

    if len(data["raw_submitted_answers"]) == 0:
        skp_json = ""
    else:
        skp_json = data["raw_submitted_answers"]

    html_params = {
        "uuid": pl.get_uuid(),
        "sketchpad_json": skp_json,
        "width": width,
        "height": height,
    }

    with open("pl-sketch.mustache", "r") as f:
        return chevron.render(f, html_params).strip()
