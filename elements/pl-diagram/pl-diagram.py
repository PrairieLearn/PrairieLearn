import lxml.html
from html import escape
import chevron
import math
import prairielearn as pl
import numpy as np
import random
import json

element_defaults = {
    'answers-name': '',
}

def parseInitialFSM(fsmElement):
    # print(fsmElement)
    return

def prepare(element_html, data):
    pass


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    for child in element:
        if(child.tag=="pl-diagram-initial"):
            for initialComponent in child:
                if initialComponent.tag=="pl-fsm":
                    parseInitialFSM(initialComponent)

    name = pl.get_string_attrib(element, 'answers-name', element_defaults['answers-name'])
    # Hardcoded diagram for testing, remove later for a diagram specified in question
    import base64
    with open('clientFilesElement/testDiag.svg','r') as f:
        j = f.read().strip().encode('ascii')
        enc = base64.b64encode(j).decode('ascii')
    
    html_params={"imgSrc":enc,"name":name}
    with open('pl-diagram.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()
    return html

def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name', element_defaults['answers-name'])
    try:
        data['submitted_answers'][name] = json.loads(data['submitted_answers'][name])
        if 'nodes' not in data['submitted_answers'][name] or 'edges' not in data['submitted_answers'][name]:
            data['format_errors'][name] = 'No submitted answer.'
            data['submitted_answers'][name] = {}
        print(data['submitted_answers'][name])
    except json.JSONDecodeError:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = {}
    return


def grade(element_html, data):
    return


def test(element_html, data):
    return
