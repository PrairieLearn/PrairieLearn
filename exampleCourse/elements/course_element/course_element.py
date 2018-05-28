import random
import chevron


def prepare(element_html, element_index, data):
    data['params']['random_number'] = random.random()
    return data


def render(element_html, element_index, data):
    html_params = {
        'number': data['params']['random_number']
    }
    with open('course_element.mustache', 'r') as f:
        return chevron.render(f, html_params).strip()
