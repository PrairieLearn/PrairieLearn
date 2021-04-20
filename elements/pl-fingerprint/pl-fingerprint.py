import prairielearn as pl
import lxml.html
import random
import chevron
import base64
import os
import json
import math

def render(element_html, data):
    variant_seed = data['variant_seed']
    with open('pl-fingerprint.mustache', 'r', encoding='utf-8') as f:
        return chevron.render(f)



