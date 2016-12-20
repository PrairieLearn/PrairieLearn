#!/usr/bin/env python

import os.path, sys, re, subprocess

if not os.path.exists("backend/config.json"):
    print("ERROR: no config.json file found")
    sys.exit(1)

course_dir = None
print("Reading backend/config.json")
with open("backend/config.json") as config_file:
    for line in config_file:
        pattern = '"courseDir" *: *\"([^"]*)\"'
        match = re.search(pattern, line)
        if match:
            dir_name = match.group(1)
            if not os.path.isabs(dir_name):
                dir_name = os.path.join("backend", dir_name)
            course_dir = dir_name

if course_dir is None:
    print("ERROR: Unable to determine courseDir from config.json")
    sys.exit(1)
print("Course directory to process for tex images: " + course_dir)

args = ["python", "tool/generate_text.py", os.path.join(course_dir, "text"), course_dir]
print("Running command: %s" % " ".join(args))
subprocess.call(args)
