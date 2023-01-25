import base64

import chevron
import lxml.html
import prairielearn as pl
import time


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = []
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html, data):
    if data["panel"] != "submission":
        return ""

    start = time.time()

    html_params = {"uuid": pl.get_uuid()}

    # Fetch the list of required files for this question
    required_file_names = data["params"].get("_required_file_names", [])
    html_params["required_files"] = required_file_names

    # Fetch any submitted files
    submitted_files = data["submitted_answers"].get("_files", [])

    # Pass through format errors from the file input elements
    html_params["errors"] = data["format_errors"].get("_files", [])

    # Decode and reshape files into a useful form
    if len(submitted_files) > 0:
        files = []
        for idx, file in enumerate(submitted_files):
            b64contents = file["contents"] or ""
            try:
                contents = base64.b64decode(b64contents).decode()
            except UnicodeDecodeError:
                contents = "Content preview is not available for this type of file."
            files.append(
                {
                    "name": file["name"],
                    "contents": contents,
                    "contentsb64": b64contents,
                    "index": idx,
                }
            )
        html_params["has_files"] = True
        html_params["files"] = files
    else:
        html_params["has_files"] = False


    with open("pl-file-preview.mustache", "r", encoding="utf-8") as f:
        html = chevron.render(f, html_params).strip()

    end = time.time()
    # print(f"Rendering took {end - start}s")

    return html
