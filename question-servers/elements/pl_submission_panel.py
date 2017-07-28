import random, lxml.html
import prairielearn

def prepare(element_html, element_index, data):
    return data

def render(element_html, element_index, data):
    if data["panel"] == "submission":
        return element_html
    else:
        return ""

def parse(element_html, element_index, data):
    return data

def grade(element_html, element_index, data):
    return data
