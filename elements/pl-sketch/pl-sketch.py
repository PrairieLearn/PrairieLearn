import random
import chevron
import prairielearn as pl

def prepare(element_html, data):
    return data

def render(element_html, data):
    if len(data['raw_submitted_answers']) == 0:
        skp_json = '';
    else:
        skp_json = data['raw_submitted_answers']

    html_params = {
        'uuid': pl.get_uuid(),
        'sketchpad_json': skp_json
    }

    with open('pl-sketch.mustache', 'r') as f:
        return chevron.render(f, html_params).strip()
