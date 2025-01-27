#!/usr/bin/env python
"""
Updates questions/ directories to use subdirectories. Run as
python reassign_to_subdirs.py

You'll need python >= 3.6 or so.

The topic is read from questions/question_name/info.json

Questions are moved to questions/topic/question_name, then the references in all infoAssessment.json files are updated.

If topic is an empty string, then the question will not be moved.

Note that it rewrites infoAssessment.json, so if there is some whitespace formatting that you care about, this script will blow it away. I don't think you *should* have meaningful formatting, though.

This script has been tested on the PHYS 213 repository. It's possible that some features of PrairieLearn are not supported, so use with care.
"""

import glob
import json
import os


def discover_to_move():
    alldata = {}
    for d in glob.glob("questions/*"):
        info = d + "/info.json"
        if os.path.isfile(d + "/info.json"):
            with open(info) as f:
                df = json.load(f)
                if "topic" in df and df["topic"] != "":
                    alldata[d.replace("questions/", "")] = df["topic"]
    return alldata


def fix_assessments(to_move):
    for fname in glob.glob("courseInstances/*/assessments/*/infoAssessment.json"):
        print(fname)
        with open(fname) as f:
            info = json.load(f)
            for zone in info["zones"]:
                for question in zone["questions"]:
                    if "id" in question and question["id"] in to_move:
                        print(question)
                        question["id"] = to_move[question["id"]] + "/" + question["id"]
                    if "alternatives" in question:
                        for ques in question["alternatives"]:
                            if ques["id"] in to_move:
                                ques["id"] = to_move[ques["id"]] + "/" + ques["id"]
        with open(fname, "w") as f:
            json.dump(info, f, sort_keys=True, indent=4, separators=(",", ": "))


def move(to_move):
    for k, it in to_move.items():
        orig_file = "questions/" + k
        moved_file = "questions/" + it + "/" + k
        if not os.path.isdir("questions/" + it):
            os.mkdir("questions/" + it)
        os.system(f"git mv {orig_file} {moved_file}")


if __name__ == "__main__":
    alldata = discover_to_move()
    fix_assessments(alldata)
    move(alldata)
    # print(alldata)
