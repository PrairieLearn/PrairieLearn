import random, lxml.html
import prairielearn as pl

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=[], optional_attribs=[])
    return data

def render(element_html, element_index, data):
    if data["panel"] == 'question':
        return element_html
    else:
        return ''
