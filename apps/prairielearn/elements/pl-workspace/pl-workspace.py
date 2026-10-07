from typing import Any

import chevron
import lxml.html
import prairielearn as pl

LABEL_DEFAULT = "Open workspace"


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = [
        "label",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] != "question":
        return ""

    element = lxml.html.fragment_fromstring(element_html)
    label = pl.get_string_attrib(element, "label", LABEL_DEFAULT)

    # Get workspace url
    workspace_url = data["options"].get("workspace_url")

    if workspace_url is None:
        raise ValueError(
            "Workspace URL not found. Did you remember to set the workspace options?"
        )

    # Create and return html
    html_params: dict[str, Any] = {
        "workspace_url": workspace_url,
        "label": label,
    }

    with open("pl-workspace.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()


def parse(element_html: str, data: pl.QuestionData) -> None:
    workspace_required_file_names = data["params"].get(
        "_workspace_required_file_names", []
    )
    submitted_file_names = [
        f.get("name", "") for f in data["submitted_answers"].get("_files", [])
    ]
    missing_files = [
        r for r in workspace_required_file_names if r not in submitted_file_names
    ]
    if missing_files:
        pl.add_files_format_error(
            data,
            f"The following required files were missing: {', '.join(missing_files)}",
        )
