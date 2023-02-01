import chevron
import lxml.html
import prairielearn as pl
from pl_file_preview_utils import order_files


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = []
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] != "submission":
        return ""

    # Fetch any submitted files
    submitted_files = data["submitted_answers"].get("_files", [])

    # We use the list of required files, if present, to determine the order
    # in which we render them. This helps ensure consistency between this and
    # other elements like `pl-file-upload`.
    required_files = data["params"].get("_required_file_names", [])
    ordered_files = order_files(submitted_files, required_files)

    html_params = {
        "uuid": pl.get_uuid(),
        "submission_files_url": data["options"]["submission_files_url"],
        # Pass through format errors from the file input elements
        "errors": data["format_errors"].get("_files", []),
        "has_files": len(submitted_files) > 0,
        "files": [
            {
                "name": file["name"],
                "index": idx,
            }
            for idx, file in enumerate(ordered_files)
        ],
    }

    with open("pl-file-preview.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
