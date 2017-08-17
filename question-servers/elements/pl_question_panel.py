import random, lxml.html
import prairielearn as pl

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=[], optional_attribs=[])
    return data

def render(element_html, element_index, data):
    if data["panel"] == 'question':
        # Change the enclosing <pl_question_panel> tags to a div
        element = lxml.html.fragment_fromstring(element_html)
        element.tag = 'div'
        return bytes.decode(lxml.html.tostring(element))
    else:
        return ''
