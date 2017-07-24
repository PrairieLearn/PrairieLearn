import random, lxml.html
import prairielearn

def prepare(element_html, element_index, data, options):
    return data

def render(element_html, element_index, data, options):
    if options["panel"] == 'answer':
        return element_html
    else:
        return ''

def parse(element_html, element_index, data, options):
    return data

def grade(element_html, element_index, data, options):
    return data
