import chevron
import prairielearn as pl


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] != "question":
        return ""

    # Get workspace url
    workspace_url = data["options"].get("workspace_url")

    if workspace_url is None:
        raise ValueError(
            "Workspace URL not found. Did you remember to set the workspace options?"
        )

    # Create and return html
    html_params = {"workspace_url": workspace_url}
    with open("pl-workspace.mustache", "r", encoding="utf-8") as f:
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
            f'The following required files were missing: {", ".join(missing_files)}',
        )
