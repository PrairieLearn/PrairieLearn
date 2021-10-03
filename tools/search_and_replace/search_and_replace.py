#!/usr/bin/env python

# This is an example python program to show how to iterate over a
# questions directory and perform search-and-replace on the files for
# each question.

import os, re

course_path = '/Users/mwest/git/pl-phys100'
questions_path = os.path.join(course_path, 'questions')

def read_file(path, filename):
    input_path = os.path.join(path, filename)
    print("reading %s" % input_path)
    try:
        with open(input_path, 'r') as input_file:
            contents = input_file.read()
    except FileNotFoundError:
        return None
    return contents

def write_file(path, filename, contents):
    input_path = os.path.join(path, filename)
    output_path = input_path + '.new'
    print("writing %s" % output_path)
    if (os.path.exists(output_file)):
        os.remove(tmp_filename) # needed on Windows
    with open(output_path, 'w') as output_file:
        output_file.write(contents)
    print("renaming %s -> %s" % (output_path, input_path))
    os.remove(input_path) # needed on Windows
    os.rename(output_path, input_path)

question_dirs = os.listdir(questions_path)
for question_dir in question_dirs:
    print("##################################################")
    question_path = os.path.join(questions_path, question_dir)

    input_filename = "question.html"
    contents = read_file(question_path, input_filename)

    # these are direct string replacements
    contents.replace('<multipleChoice>', '<pl-multiple-choice>');
    contents.replace('</multipleChoice>', '</pl-multiple-choice>');

    # these are regular expression replacements
    contents = re.sub(r'<(/?)checkbox>', '<\1pl-checkbox>', contents);

    write_file(question_path, input_filename, contents)
