import prairielearn as pl
import json, base64 as b64
import markdown

def generate(data):
    pass

def parse(data):
    file = [f for f in data['submitted_answers']['_files']
            if f['name'] == 'ans.md'] \
               if '_files' in data['submitted_answers'] else False
    content = str(b64.b64decode(file[0]['contents']), 'utf-8') if file else ''
    
    data['submitted_answers']['ans'] = content
