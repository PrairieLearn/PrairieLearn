import prairielearn as pl
import lxml.html
import chevron
import os
from html import escape
import to_precision




def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['x_answer_name','y_answer_name','height_answer_name','width_answer_name','file_name'], optional_attribs=['scale','answer_scale','test_x','test_y','test_width', 'type', 'test_height', 'show_coordinates'])
    x_name = element.get('x_answer_name')
    y_name = element.get('y_answer_name')
    width_name = element.get('width_answer_name')
    height_name = element.get('height_answer_name')
    return data


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    x_name = element.get('x_answer_name')
    y_name = element.get('x_answer_name')
    width_name = element.get('width_answer_name')
    height_name = element.get('height_answer_name')
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

    # Get scale (optional)
    answer_scale = pl.get_string_attrib(element, 'answer_scale', None)
    if answer_scale is None:
        answer_scale = 50

    # Get full url
    file_url = os.path.join(base_url, file_name)
    if data['panel'] == 'question':

        # Get scale (optional)
        scale = pl.get_string_attrib(element, 'scale', None)
        if scale is None:
            scale = 100
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
        html_params = {'question': True, 'src': file_url, 'scale': scale,'answer_scale': answer_scale, 'test_x':test_x, 'test_y':test_y, 'test_width':test_width, 'test_height':test_height, 'show_coordinates':show_coordinates }
        with open('pl_img_click.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'submission':
        uuid = pl.get_uuid()
        #get the answer for x and y cordinates
        try:
            sub_x = data['submitted_answers']['submitted_x_val']
            sub_y = data['submitted_answers']['submitted_y_val']
            html_params = {'submission': True, 'src': file_url, 'uuid': uuid, 'submission_x': sub_x,'submission_y': sub_y, 'answer_scale': answer_scale, }
            with open('pl_img_click.mustache', 'r') as f:
                html = chevron.render(f, html_params).strip()
        except KeyError:
            html = 'No value detected, click image to generate answer'

    elif data['panel'] == 'answer':
        html_params = {'answer': True, 'src': file_url, 'answer_scale': answer_scale, 'answer_x': data['correct_answers']['x'],'answer_y': data['correct_answers']['y'] }
        with open('pl_img_click.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()
    else:
        html = ''

    return html

def parse(element_html, element_index, data):
    #Get the stuff parse into float save into same spot
    element = lxml.html.fragment_fromstring(element_html)
    x_name = pl.get_string_attrib(element, 'x_answer_name')
    y_name = pl.get_string_attrib(element, 'y_answer_name')
    width_name = element.get('width_answer_name')
    height_name = element.get('height_answer_name')
    if(data['submitted_answers'].get('cordinate_x') == ''):
        data['format_errors'][x_name] = 'No submitted answer.'
        return data
    x_val = float(data['submitted_answers'].get('cordinate_x'))
    y_val = float(data['submitted_answers'].get('cordinate_y'))
    data['submitted_answers']['submitted_x_val'] = x_val
    data['submitted_answers']['submitted_y_val'] = y_val

    return data

def grade(element_html, element_index, data):
    #Get the coordinates, get the server answers, check if answser is within rage and in that case give correct
    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    element = lxml.html.fragment_fromstring(element_html)
    x_name = pl.get_string_attrib(element, 'x_answer_name')
    y_name = pl.get_string_attrib(element, 'y_answer_name')
    width_name = element.get('width_answer_name')
    height_name = element.get('height_answer_name')
    weight = pl.get_integer_attrib(element, 'weight', 1)
    x_val = data['submitted_answers']['submitted_x_val']
    y_val = data['submitted_answers']['submitted_y_val']
    x = data['correct_answers'][x_name]
    y = data['correct_answers'][y_name]
    width_ans = data['correct_answers'][width_name]
    height_ans = data['correct_answers'][height_name]
    x = x - (width_ans/2)
    y = y - (height_ans/2)
    if(x_val >= x and x_val <= (x+width_ans) and y_val>=y and y_val <= (y+height_ans)):
         data['partial_scores'][x_name] = {'score': 1, 'weight': weight}
    else:
         data['partial_scores'][x_name] = {'score': 0, 'weight': weight}


    return data