import chevron


def add_format_error(data, error_string):
    if '_files' not in data['format_errors']:
        data['format_errors']['_files'] = []
    data['format_errors']['_files'].append(error_string)


def render(element_html, data):
    # Get workspace url
    # TODO: Improve UX if key undefined (https://github.com/PrairieLearn/PrairieLearn/pull/2665#discussion_r449319839)
    workspace_url = data['options']['workspace_url']

    # Create and return html
    html_params = {'workspace_url': workspace_url}
    with open('pl-workspace.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html


def parse(element_html, data):
    required_file_names = data['submitted_answers'].get('_required_file_names', [])

    # Get submitted files or return parse_error if it does not exist
    files = data['submitted_answers'].get('_files', None)
    if not files:
        add_format_error(data, 'No submitted answer for workspace.')
        return

    # Filter out any files that were not listed in workspaceOptions.gradedFiles
    parsed_files = [x for x in files if x.get('name', '') in required_file_names]

    # Validate that all required files are present
    if parsed_files is not None:
        submitted_file_names = [x.get('name', '') for x in parsed_files]
        missing_files = [x for x in required_file_names if x not in submitted_file_names]

        if len(missing_files) > 0:
            add_format_error(data, f'The following required files were missing: {", ".join(missing_files)}')
