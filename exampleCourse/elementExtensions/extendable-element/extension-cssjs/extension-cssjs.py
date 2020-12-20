import chevron
import os

def render_this_extension(client_files):
    with open('extension-cssjs.mustache') as f:
        return chevron.render(f).strip()
