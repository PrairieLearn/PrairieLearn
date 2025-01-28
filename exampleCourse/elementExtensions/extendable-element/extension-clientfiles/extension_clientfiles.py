def render_this_extension(client_files):
    return (
        "<p>Extensions may have their own client files directory. "
        + "This URL is given to the parent element in "
        + '<code class="user-output">data["options"]["client_files_extensions_url"][extension_name]</code>.'
        + "</p>"
        + f'<img src="{client_files}/cat-2536662_640.jpg">'
    )
