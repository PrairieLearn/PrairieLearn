import random

import chevron


def prepare(_element_html, data):
    data["params"]["random_number"] = random.random()


def render(_element_html, data):
    html_params = {
        "number": data["params"]["random_number"],
        "image_url": data["options"]["client_files_element_url"] + "/block_i.png",
    }
    with open("course-element.mustache") as f:
        return chevron.render(f, html_params).strip()
