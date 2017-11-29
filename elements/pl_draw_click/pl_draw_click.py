import prairielearn as pl
import lxml.html
import chevron
import os
from html import escape
import to_precision



def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['answers_name','file_name'], optional_attribs=['width','test_x','test_y','test_width', 'test_height', 'type', 'directory', 'show_coordinates'])
    name = element.get('answers_name')
    return data


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = element.get('answers_name')

    # Get file name or raise exception if one does not exist
    file_name = pl.get_string_attrib(element, 'file_name')

    # Get type (default is static)
    file_type = pl.get_string_attrib(element, 'type', 'static')

    # Get directory (default is clientFilesQuestion)
    file_directory = pl.get_string_attrib(element, 'directory', 'clientFilesQuestion')

    # Get base url, which depends on the type and directory
    if file_type == 'static':
        if file_directory == 'clientFilesQuestion':
            base_url = data['options']['client_files_question_url']
        elif file_directory == 'clientFilesCourse':
            base_url = data['options']['client_files_course_url']
        else:
            raise ValueError('directory "{}" is not valid for type "{}" (must be "clientFilesQuestion" or "clientFilesCourse")'.format(file_directory, file_type))
    elif file_type == 'dynamic':
        if pl.has_attrib(element, 'directory'):
            raise ValueError('no directory ("{}") can be provided for type "{}"'.format(file_directory, file_type))
        else:
            base_url = data['options']['client_files_question_dynamic_url']
    else:
        raise ValueError('type "{}" is not valid (must be "static" or "dynamic")'.format(file_type))

    # Get full url
    file_url = os.path.join(base_url, file_name)

    # Get width (optional)
    width = pl.get_string_attrib(element, 'width', None)


    # Get test_x (optional)
    test_x = pl.get_string_attrib(element, 'test_x', None)

    # Get test_x (optional)
    test_y = pl.get_string_attrib(element, 'test_y', None)

    # Get test_width (optional)
    test_width = pl.get_string_attrib(element, 'test_width', None)

    # Get test_height (optional)
    test_height = pl.get_string_attrib(element, 'test_height', None)

     # Get show_coordinates (optional)

    show_coordinates = pl.get_string_attrib(element, 'show_coordinates', None)


    # Create and return html
    html_params = {'src': file_url, 'width': width, 'test_x':test_x, 'test_y':test_y, 'test_width':test_width, 'test_height':test_height, 'show_coordinates':show_coordinates }
    with open('pl_draw_click.mustache', 'r') as f:
        html = chevron.render(f, html_params).strip()
    return html

def parse(element_html, element_index, data):
    #Get the stuff parse into float save into same spot
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    if(data['submitted_answers'].get('cordinate_x') == ''):
        data['format_errors'][name] = 'No submitted answer.'
        return data
    x_val = float(data['submitted_answers'].get('cordinate_x'))
    y_val = float(data['submitted_answers'].get('cordinate_y'))

    data['submitted_answers']['x_val'] = x_val
    data['submitted_answers']['y_val'] = y_val


    return data

def grade(element_html, element_index, data):
    #Get the coordinates, get the server answers, check if answser is within rage and in that case give correct
    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    weight = pl.get_integer_attrib(element, 'weight', 1)

    x_val = data['submitted_answers']['x_val']
    y_val = data['submitted_answers']['y_val']
    x = data['correct_answers']['x']
    y = data['correct_answers']['y']
    width_ans = data['correct_answers']['width']
    height_ans = data['correct_answers']['height']

    if(x_val >= x and x_val <= (x+width_ans) and y_val>=y and y_val <= (y+height_ans)):
         data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
         data['partial_scores'][name] = {'score': 0, 'weight': weight}


    return data