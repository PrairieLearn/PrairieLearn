import lxml.html
import chevron
import os
import prairielearn as pl

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=["file_name"], optional_attribs=["width"])
    return data

def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)

    # Get file name or raise exception if one does not exist
    name = pl.get_string_attrib(element, "file_name")

    # Get base directory or raise exception if one does not exist
    # FIXME: put client_files_question_url at top level in options?
    base = data["options"]["client_files_question_url"]

    # Create full path to image file
    src = os.path.join(base,name)

    # Get width (optional)
    width = pl.get_string_attrib(element, "width",None)

    # Create and return html
    html_params = {'src': src, 'width': width}
    with open('pl_figure.mustache','r') as f:
        html = chevron.render(f,html_params).strip()

    return html

def parse(element_html, element_index, data):
    return data

def grade(element_html, element_index, data):
    return data

def test(element_html, element_index, data):
    return data
