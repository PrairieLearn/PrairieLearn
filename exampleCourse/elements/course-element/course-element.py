import random
import chevron


def prepare(element_html, data):
    data['params']['random_number'] = random.random()
    return data


def render(element_html, data):
    html_params = {
        'number': data['params']['random_number'],
        'image_url': data['options']['elements_url'] + '/course-element/clientFilesElement/block_i.png'
    }
    with open('course-element.mustache', 'r') as f:
        return chevron.render(f, html_params).strip()
