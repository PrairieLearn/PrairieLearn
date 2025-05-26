import chevron
import prairielearn as pl


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] != "question":
        return ""

    html_params = {
        "variant_id": data["options"].get("variant_id", ""),
        "uuid": pl.get_uuid(),
    }

    qr_code_url = f"{data['options'].get('serverCanonicalHost')}/pl/variants/{html_params['variant_id']}/external_image_capture/element/{html_params['uuid']}"
    html_params["qr_code_url"] = qr_code_url

    with open("pl-external-image-capture.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
