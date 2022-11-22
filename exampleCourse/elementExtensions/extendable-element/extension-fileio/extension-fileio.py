import os
import html


def render_this_extension(client_files):
    contents = open('extension-fileio.py', 'r').read()
    return '<p>Extensions are executed in their own directory.\n' + \
        'This lets them read or write to files like elements can.</p>\n' + \
        '<p>This extension displays its own source code.</p>\n' + \
        '<pl-code language="python">\n' + \
        f'{html.escape(contents)}\n' + \
        '</pl-code>'
