import html


def render_this_extension(_client_files):
    with open("extension-fileio.py") as f:
        contents = f.read()
        return (
            "<p>Extensions are executed in their own directory.\n"
            + "This lets them read or write to files like elements can.</p>\n"
            + "<p>This extension displays its own source code.</p>\n"
            + '<pl-code language="python">\n'
            + f"{html.escape(contents)}\n"
            + "</pl-code>"
        )
