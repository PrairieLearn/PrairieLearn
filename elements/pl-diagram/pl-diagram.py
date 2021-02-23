import lxml.html
from html import escape
import chevron
import math
import prairielearn as pl
import numpy as np
import random


RTOL_DEFAULT = 1e-2
ATOL_DEFAULT = 1e-8
SIZE_DEFAULT = 35
DIGITS_DEFAULT = 2
WEIGHT_DEFAULT = 1
DISPLAY_DEFAULT = 'inline'
COMPARISON_DEFAULT = 'relabs'
ALLOW_COMPLEX_DEFAULT = False
SHOW_HELP_TEXT_DEFAULT = True
SHOW_PLACEHOLDER_DEFAULT = True
SHOW_CORRECT_ANSWER_DEFAULT = True
ALLOW_FRACTIONS_DEFAULT = True
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = 0


def prepare(element_html, data):
    pass


def render(element_html, data):
    import base64
    with open('clientFilesElement/diag.svg','r') as f:
        j = f.read().strip().encode('ascii')
        enc = base64.b64encode(j).decode('ascii')
    html_params={"imgSrc":enc}
    with open('pl-diagram.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()
    return html

def parse(element_html, data):
    return


def grade(element_html, data):
    return


def test(element_html, data):
    return
