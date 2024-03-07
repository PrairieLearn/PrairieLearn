import chevron
import lxml.html
import prairielearn as pl
from colors import PLColor


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = []
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] != "submission":
        return ""

    # Fetch any submitted files
    submitted_files = data["submitted_answers"].get("_files", [])

    # Order alphabetically so we can display them in a consistent order
    ordered_files = sorted(submitted_files, key=lambda x: x.get("name", None))

    html_params = {
        "uuid": pl.get_uuid(),
        "submission_files_url": data["options"]["submission_files_url"],
        "check_icon_color": PLColor("correct_green"),
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
