import chevron
import prairielearn as pl


def render(element_html: str, data: pl.QuestionData):
    if data["panel"] != "submission":
        return ""

    html_params = {
        "uuid": pl.get_uuid(),
        "submission_files_url": data["options"]["submission_files_url"],
    }

    # Fetch the list of required files for this question
    required_file_names = data["params"].get("_required_file_names", [])
    html_params["required_files"] = required_file_names

    # Fetch any submitted files
    submitted_files = data["submitted_answers"].get("_files", [])

    # Pass through format errors from the file input elements
    html_params["errors"] = data["format_errors"].get("_files", [])

    # Reshape files into a useful form
    html_params["has_files"] = len(submitted_files) > 0
    html_params["files"] = [
        {
            "name": file["name"],
            "index": idx,
        }
        for idx, file in enumerate(submitted_files)
    ]

    with open("pl-file-preview.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
