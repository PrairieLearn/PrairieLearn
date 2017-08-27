import random
import chevron

def render(element_html, element_index, data):
    html_params = { 'number': random.random() }
    with open('course_element.mustache','r') as f:
        return chevron.render(f, html_params).strip()
