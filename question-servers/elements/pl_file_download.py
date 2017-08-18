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


    if file_type=="static":
        if file_scope=="question":
            base = data["options"]["client_files_question_url"]
        elif file_scope=="assessment":
            base = data["options"]["client_files_assessment_url"]
        elif file_scope=="instance":
            base = data["options"]["client_files_instance_url"]
        elif file_scope=="course":
            base = data["options"]["client_files_course_url"]
        else:
            raise ValueError('scope {} is not valid for type {} (must be "question", "assessment", "instance", or "course")'.format(file_scope,file_type))
    elif file_type=="dynamic":
        if file_scope=="question":
            base = data["options"]["client_files_question_dynamic_url"]
        else:
            raise ValueError('scope {} is not valid for type {} (must be "question")'.format(file_scope,file_type))
    else:
            raise ValueError('type {} is not valid (must be "static" or "dynamic")'.format(file_type))


    # # Get base directory or raise exception if one does not exist
    # # FIXME: put client_files_question_url at top level in options?
    # base = data["options"]["client_files_question_url"]
    #
    # # Create full path to image file
    # src = os.path.join(base,name)
    #
    # # Get width (optional)
    # width = pl.get_string_attrib(element, "width",None)


    # base = data["options"]["client_files_question_url"]
    src = os.path.join(base,file_name)

    # Create and return html
    # html_params = {'src': src, 'width': width}
    html_params = {}
    html_params['dynamic_question_url'] = data["options"]["client_files_question_dynamic_url"]
    html_params['question_url'] = data["options"]["client_files_question_url"]
    html_params['assessment_url'] = data["options"]["client_files_assessment_url"]
    html_params['instance_url'] = data["options"]["client_files_instance_url"]
    html_params['course_url'] = data["options"]["client_files_course_url"]
    html_params['file_url'] = src
    html_params['file_label'] = file_label

    # html_params = {'question_url': data["options"]["client_files_question_url"]}
    with open('pl_file_download.mustache','r') as f:
        html = chevron.render(f,html_params).strip()

    return html

def parse(element_html, element_index, data):
    return data

def grade(element_html, element_index, data):
    return data

def test(element_html, element_index, data):
    return data

def file(element_html, element_index, data):
    return ''
