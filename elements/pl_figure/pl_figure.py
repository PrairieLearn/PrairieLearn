import lxml.html
import chevron
import os
import prairielearn as pl

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=["file_name"], optional_attribs=["width","type","directory"])
    return data

def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)

    # Get file name or raise exception if one does not exist
    file_name = pl.get_string_attrib(element, "file_name")

    # Get type (default is static)
    file_type = pl.get_string_attrib(element, "type", "static")

    # Get directory (default is clientFilesQuestion)
    file_directory = pl.get_string_attrib(element, "directory", "clientFilesQuestion")

    # Get base url, which depends on the type and directory
    if file_type=="static":
        if file_directory=="clientFilesQuestion":
            base_url = data["options"]["client_files_question_url"]
        elif file_directory=="clientFilesCourse":
            base_url = data["options"]["client_files_course_url"]
        else:
            raise ValueError('directory "{}" is not valid for type "{}" (must be "clientFilesQuestion" or "clientFilesCourse")'.format(file_directory,file_type))
    elif file_type=="dynamic":
        if pl.has_attrib(element, "directory"):
            raise ValueError('no directory ("{}") can be provided for type "{}"'.format(file_directory,file_type))
        else:
            base_url = data["options"]["client_files_question_dynamic_url"]
    else:
        raise ValueError('type "{}" is not valid (must be "static" or "dynamic")'.format(file_type))

    # Get full url
    file_url = os.path.join(base_url,file_name)

    # Get width (optional)
    width = pl.get_string_attrib(element, "width",None)

    # Create and return html
    html_params = {'src': file_url, 'width': width}
    with open('pl_figure.mustache','r') as f:
        html = chevron.render(f,html_params).strip()

    return html
