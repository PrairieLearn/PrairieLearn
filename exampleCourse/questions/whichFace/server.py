import numpy as np
import json
import itertools


def get_name(student):
    if student['preferred'] is None:
        first = student['first']
    else:
        first = student['preferred']
    return first + ' ' + student['last']


def generate(data):
    basedir = '../../clientFilesCourse/'

    # Get list of students
    with open(basedir + 'student_names.json', 'r') as infile:
        all_students = json.load(infile)

    n = 5
    while True:
        # Choose n students uniformly at random without replacement
        students = np.random.choice(all_students, n, replace=False)

        # The first student is the one we will ask about
        uin = students[0]['uin']

        # Verify that none of these students have the same name
        duplicate = False
        for pair in itertools.combinations(students, 2):
            if get_name(pair[0]) == get_name(pair[1]):
                duplicate = True
        if not duplicate:
            break

    data['params']['name'] = get_name(students[0])
    for i in range(0, n):
        data['params']['image{:d}'.format(i)] = '{:s}student_images/{:s}.png'.format(basedir, students[i]['uin'])
