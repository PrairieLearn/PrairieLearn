import chevron


def render(element_html, data):
    # Get workspace url
    # TODO: Improve UX if key undefined (https://github.com/PrairieLearn/PrairieLearn/pull/2665#discussion_r449319839)
    workspace_url = data['options']['workspace_url']

    # Create and return html
    html_params = {'workspace_url': workspace_url}
    with open('pl-workspace.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
