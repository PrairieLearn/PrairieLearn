import numpy as np
import json
import itertools
from os import path


def get_name(student):
    if student['preferred'] is None:
        first = student['first']
    else:
        first = student['preferred']
    return first + ' ' + student['last']


def generate(data):
    # We will get our list of students from clientFilesCourse
    base_path = data['options']['client_files_course_path']

    # Get list of students
    with open(path.join(base_path, 'student_names.json'), 'r') as infile:
        all_students = json.load(infile)

    n = 5
    while True:
        # Choose n students uniformly at random without replacement
        students = np.random.choice(all_students, n, replace=False)

        # Verify that none of these students have the same name
        duplicate = False
        for pair in itertools.combinations(students, 2):
            if get_name(pair[0]) == get_name(pair[1]):
                duplicate = True
        if not duplicate:
            break

    # The first student is the one we will ask about
    students[0]['correct'] = True
    data['params']['name'] = get_name(students[0])
    data['params']['students'] = students.tolist()
