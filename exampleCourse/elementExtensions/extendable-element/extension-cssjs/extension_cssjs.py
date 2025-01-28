import chevron


def render_this_extension(_client_files):
    with open("extension_cssjs.mustache") as f:
        return chevron.render(f).strip()
