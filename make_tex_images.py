#!/usr/bin/env python

import os.path, sys, re, subprocess

if not os.path.exists("backend/config.json"):
    print("ERROR: no config.json file found")
    sys.exit(1)

dir_list = []
print("Reading backend/config.json")
with open("backend/config.json") as config_file:
    for line in config_file:
        for pattern in [
                '"questionsDir" *: *\"([^"]*)\"',
                '"courseCodeDir" *: *\"([^"]*)\"',
        ]:
            match = re.search(pattern, line)
            if match:
                dir_name = match.group(1)
                if not os.path.isabs(dir_name):
                    dir_name = os.path.join("backend", dir_name)
                dir_list.append(dir_name)

if len(dir_list) <= 0:
    print("ERROR: Unable to determine any directories from config.json")
    sys.exit(1)
print("Directories to process for tex images:")
for dir_name in dir_list:
    print(dir_name)

args = ["python", "tool/generate_text.py", "frontend/text"] + dir_list
print("Running command: %s" % " ".join(args))
subprocess.call(args)
