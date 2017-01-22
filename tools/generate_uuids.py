#!/usr/bin/env python

import sys, os, json, re, uuid

if len(sys.argv) < 2:
    print("Usage: generate_uuids <coursedir>")
    sys.exit(0)

start_re = re.compile(r"^(\s*{ *\n)(.*)$", re.DOTALL)
    
def add_uuid_to_file(filename):
    try:
        with open(filename, 'rU') as in_f:
            contents = in_f.read()
        data = json.loads(contents)
        if "uuid" in data:
            return 0
        match = start_re.match(contents)
        if match is None:
            raise Exception("file does not begin with a single line containing a \"{\" character")
        new_contents = match.group(1) + ("    \"uuid\": \"%s\",\n" % uuid.uuid4()) + match.group(2)
        tmp_filename = filename + ".tmp_with_uuid"
        if os.path.exists(tmp_filename):
            os.remove(tmp_filename) # needed on Windows
        with open(tmp_filename, "w") as out_f:
            out_f.write(new_contents)
        os.remove(filename) # needed on Windows
        os.rename(tmp_filename, filename)
        return 1
    except Exception as error:
        print("WARNING: skipping %s: %s" % (filename, error))
        return 0
    
def ensure_is_dir(path):
    if not os.path.isdir(path):
        print("ERROR: Not a directory: %s" % path)
        sys.exit(1)

num_added = 0
        
course_dir = sys.argv[1]
print("Processing course directory: %s" % course_dir)
ensure_is_dir(course_dir)
num_added += add_uuid_to_file(os.path.join(course_dir, "infoCourse.json"))

questions_dir = os.path.join(course_dir, "questions")
print("Processing questions directory: %s" % questions_dir)
ensure_is_dir(questions_dir)
question_dir_names = os.listdir(questions_dir)
for question_dir_name in question_dir_names:
    question_path = os.path.join(questions_dir, question_dir_name)
    if os.path.isdir(question_path):
        info_file_name = os.path.join(question_path, "info.json")
        num_added += add_uuid_to_file(info_file_name)

course_instances_dir = os.path.join(course_dir, "courseInstances")
print("Processing courseInstances directory: %s" % course_instances_dir)
ensure_is_dir(course_instances_dir)
course_instance_dir_names = os.listdir(course_instances_dir)
for course_instance_dir_name in course_instance_dir_names:
    course_instance_path = os.path.join(course_instances_dir, course_instance_dir_name)
    if os.path.isdir(course_instance_path):
        info_file_name = os.path.join(course_instance_path, "infoCourseInstance.json")
        num_added += add_uuid_to_file(info_file_name)
        assessments_dir = os.path.join(course_instance_path, "assessments")
        print("Processing assessments directory: %s" % assessments_dir)
        if os.path.isdir(assessments_dir):
            assessment_dir_names = os.listdir(assessments_dir)
            for assessment_dir_name in assessment_dir_names:
                assessment_path = os.path.join(assessments_dir, assessment_dir_name)
                if os.path.isdir(assessment_path):
                    info_file_name = os.path.join(assessment_path, "infoAssessment.json")
                    num_added += add_uuid_to_file(info_file_name)

print("Sucessfully completed")
print("Added UUID to %d files" % num_added)
