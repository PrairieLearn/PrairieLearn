import chevron
import prairielearn as pl
import time


def render(element_html: str, data: pl.QuestionData):
    if data["panel"] != "submission":
        return ""

    # Fetch any submitted files
    submitted_files = data["submitted_answers"].get("_files", [])

    html_params = {
        "uuid": pl.get_uuid(),
        "submission_files_url": data["options"]["submission_files_url"],
        # Pass through format errors from the file input elements
        "errors": data["format_errors"].get("_files", []),
        "has_files": len(submitted_files) > 0,
        "files" : [
            {
                "name": file["name"],
                "index": idx,
            }
            for idx, file in enumerate(submitted_files)
        ]
    }


    with open("pl-file-preview.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
