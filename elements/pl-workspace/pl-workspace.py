import chevron


def render(element_html, data):
    # Get workspace url
    workspace_url = data['options']['workspace_url']

    # Create and return html
    html_params = {'workspace_url': workspace_url}
    with open('pl-workspace.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
