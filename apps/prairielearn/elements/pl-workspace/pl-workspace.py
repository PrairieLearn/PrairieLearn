import chevron


def add_format_error(data, error_string):
    if "_files" not in data["format_errors"]:
        data["format_errors"]["_files"] = []
    data["format_errors"]["_files"].append(error_string)


def render(element_html, data):
    if data["panel"] != "question":
        return ""

    # Get workspace url
    # TODO: Improve UX if key undefined (https://github.com/PrairieLearn/PrairieLearn/pull/2665#discussion_r449319839)
    workspace_url = data["options"]["workspace_url"]

    # Create and return html
    html_params = {"workspace_url": workspace_url}
    with open("pl-workspace.mustache", "r", encoding="utf-8") as f:
        html = chevron.render(f, html_params).strip()

    return html


def parse(element_html, data):
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
        add_format_error(
            data,
            f'The following required files were missing: {", ".join(missing_files)}',
        )
