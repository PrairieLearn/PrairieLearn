# Setup code
import json
import sys
import os
import prairielearn as pl
import numpy as np
import random
test_iter_num = {test_iter_num}
data = {'params': {'names_for_user': [{'name': 'x', 'type': 'float', 'description': 'The number that needs to be squared'}], 'names_from_user': [{'name': 'x_sq', 'type': 'float', 'description': 'The square of $x$'}], '_required_file_names': ['user_code.py']}, 'correct_answers': {}, 'submitted_answers': {'_files': [{'name': 'user_code.py', 'contents': 'aW1wb3J0IG51bXB5IGFzIG5wCgojIFRoaXMgZGVmYXVsdCBjb2RlIGlzIGRlZmluZWQgaW4gImluaXRpYWxfY29kZS5weSIKCnhfc3EgPSB4ICogeCAjIGZpbGwgaW4gdGhpcyBjb2RlIGhlcmUuLi4='}], '_file_editor_b0d2f450c232d5128c539493c359448a386ccbc7': 'aW1wb3J0IG51bXB5IGFzIG5wCgojIFRoaXMgZGVmYXVsdCBjb2RlIGlzIGRlZmluZWQgaW4gImluaXRpYWxfY29kZS5weSIKCnhfc3EgPSB4ICogeCAjIGZpbGwgaW4gdGhpcyBjb2RlIGhlcmUuLi4='}, 'format_errors': {}, 'partial_scores': {}, 'score': 0, 'feedback': {}, 'variant_seed': 1806013751, 'options': {}, 'raw_submitted_answers': {'_file_editor_b0d2f450c232d5128c539493c359448a386ccbc7': 'aW1wb3J0IG51bXB5IGFzIG5wCgojIFRoaXMgZGVmYXVsdCBjb2RlIGlzIGRlZmluZWQgaW4gImluaXRpYWxfY29kZS5weSIKCnhfc3EgPSB4ICogeCAjIGZpbGwgaW4gdGhpcyBjb2RlIGhlcmUuLi4='}, 'gradable': True}
# Anything in this file will be run before the student's code
# Use it to generate anything needed for the solution
x = random.random()
# Repeated Setup code
pass
# Remove Disallowed Variables
del test_iter_num
del data
# Student Code
# This default code is defined in "initial_code.py"
x_sq = x * x  # fill in this code here...
# Serialization Code
sys.path.append("/grade/run/")
json_contents = {"x_sq": pl.to_json(x_sq)}
student_output_file = '/grade/run/filenames/student_output.json'
if os.path.exists(student_output_file):
    os.remove(student_output_file)
with open(student_output_file, 'w', encoding='utf-8') as f:
    json.dump(json_contents, f)
