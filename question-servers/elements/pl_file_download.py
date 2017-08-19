import lxml.html
import chevron
import os
import prairielearn as pl

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=["file_name"], optional_attribs=["type","scope","label"])
    return data

def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)

    # Get file name or raise exception if one does not exist
    file_name = pl.get_string_attrib(element, "file_name")

    # Get type (default is static)
    file_type = pl.get_string_attrib(element, "type", "static")

    # Get scope (default is question)
    file_scope = pl.get_string_attrib(element, "scope", "question")

    # Get label (default is file_name)
    file_label = pl.get_string_attrib(element, "label", file_name)

    # Get base url, which depends on the type and scope
    if file_type=="static":
        if file_scope=="question":
            base_url = data["options"]["client_files_question_url"]
        elif file_scope=="course":
            base_url = data["options"]["client_files_course_url"]
        else:
            raise ValueError('scope {} is not valid for type {} (must be "question" or "course")'.format(file_scope,file_type))
    elif file_type=="dynamic":
        if file_scope=="question":
            base_url = data["options"]["client_files_question_dynamic_url"]
        else:
            raise ValueError('scope {} is not valid for type {} (must be "question")'.format(file_scope,file_type))
    else:
        raise ValueError('type {} is not valid (must be "static" or "dynamic")'.format(file_type))

    # Get full url
    file_url = os.path.join(base_url,file_name)

    # Create and return html
    return '''<a href="'''+file_url+'''" download>'''+file_label+'''</a>'''

def parse(element_html, element_index, data):
    return data

def grade(element_html, element_index, data):
    return data

def test(element_html, element_index, data):
    return data

def file(element_html, element_index, data):
    return ''
