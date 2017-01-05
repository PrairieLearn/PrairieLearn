#!/usr/bin/env python

# This is an example python program to show how to iterate
# over a questions directory and perform search-and-replace on the
# info.json files for each question.

import os

course_path = '/Users/mwest/git/pl-tam251'
questions_path = os.path.join(course_path, 'questions')

question_dirs = os.listdir(questions_path)
for question_dir in question_dirs:
    print("##################################################")
    question_path = os.path.join(questions_path, question_dir)
    print("question_path: %s" % question_path)

    input_filename = "info.json"
    input_path = os.path.join(question_path, input_filename)
    print("reading %s" % input_path)
    input_file = open(input_path, 'r')
    contents = input_file.read()
    input_file.close()
    
    print("performing replacements on file contents")
    contents = contents.replace('"non-test"', '"nontest"')
    contents = contents.replace('"2015Fall"', '"Fa15"')

    output_filename = input_filename + ".new"
    output_path = os.path.join(question_path, output_filename)
    print("writing %s" % output_path)
    output_file = open(output_path, 'w')
    output_file.write(contents)
    output_file.close()

    print("deleting %s" % input_path)
    os.remove(input_path)

    print("renaming %s to %s" % (output_path, input_path))
    os.rename(output_path, input_path)
