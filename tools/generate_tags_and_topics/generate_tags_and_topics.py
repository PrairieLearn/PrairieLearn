#!/usr/bin/env python

import sys, os, json, random

if len(sys.argv) < 2:
    print("Usage: generate_tags_and_topics <coursedir>")
    sys.exit(0)

course_dir = sys.argv[1]
if not os.path.isdir(course_dir):
    print("ERROR: Not a directory: %s" % course_dir)
    sys.exit(1)

######################################################################
# read in existing topics and tags

course_info_file_name = os.path.join(course_dir, 'infoCourse.json')
try:
    with open(course_info_file_name, 'rU') as course_info_file:
        course_info = json.load(course_info_file)
except Exception as error:
    print("ERROR: Unable to read %s: %s" % (course_info_file_name, error))
    sys.exit(1)

existing_tags = set()
existing_tag_colors = set()
if 'tags' in course_info:
    existing_tags = set([t['name'] for t in course_info['tags']])
    existing_tag_colors = set([t['color'] for t in course_info['tags']])

existing_topics = set()
existing_topic_colors = set()
if 'topics' in course_info:
    existing_topics = set([t['name'] for t in course_info['topics']])
    existing_topic_colors = set([t['color'] for t in course_info['topics']])

questions_dir = os.path.join(course_dir, 'questions')
if not os.path.isdir(questions_dir):
    print("ERROR: Not a directory: %s" % questions_dir)
    sys.exit(1)

######################################################################
# read in question topics and tags

tags = set()
topics = set()
    
question_dir_names = os.listdir(questions_dir)
for question_dir_name in question_dir_names:
    question_path = os.path.join(questions_dir, question_dir_name)
    if os.path.isdir(question_path):
        info_file_name = os.path.join(question_path, 'info.json')
        try:
            with open(info_file_name, 'rU') as info_file:
                question_info = json.load(info_file)
                if 'tags' in question_info:
                    tags |= set(question_info['tags'])
                if 'topic' in question_info:
                    topics.add(question_info['topic'])
        except Exception as error:
            print("WARNING: skipping %s: %s" % (question_path, error))

new_tags = tags - existing_tags
new_topics = topics - existing_topics

######################################################################
# assign colors

all_colors = set([
    'red1', 'red2', 'red3',
    'pink1', 'pink2', 'pink3',
    'purple1', 'purple2', 'purple3',
    'blue1', 'blue2', 'blue3',
    'turquoise1', 'turquoise2', 'turquoise3',
    'green1', 'green2', 'green3',
    'yellow1', 'yellow2', 'yellow3',
    'orange1', 'orange2', 'orange3',
    'brown1', 'brown2', 'brown3',
    'gray1', 'gray2', 'gray3',
])

available_tag_colors = all_colors - existing_tag_colors
available_topic_colors = all_colors - existing_topic_colors

new_tags_list = []
for tag in new_tags:
    if len(available_tag_colors) > 0:
        color = random.sample(available_tag_colors, 1)[0]
        available_tag_colors.remove(color)
    else:
        color = random.sample(all_colors, 1)[0]
    new_tags_list.append({"name": tag, "color": color})

new_topics_list = []
for topic in new_topics:
    if len(available_topic_colors) > 0:
        color = random.sample(available_topic_colors, 1)[0]
        available_topic_colors.remove(color)
    else:
        color = random.sample(all_colors, 1)[0]
    new_topics_list.append({"name": topic, "color": color})

new_tags_list.sort(key=lambda x: x["name"])
new_topics_list.sort(key=lambda x: x["name"])

######################################################################
# print output

print("New tags and topics not already present in %s" % course_info_file_name)
print("{")

print("    \"topics\": [")
for (i, new_topic) in enumerate(new_topics_list):
    trailing_comma = ","
    if i >= len(new_topics_list) - 1:
        trailing_comma = ""
    print("        {\"name\": \"%s\", \"color\": \"%s\"}%s" % (new_topic["name"], new_topic["color"], trailing_comma))
print("    ],")

print("    \"tags\": [")
for (i, new_tag) in enumerate(new_tags_list):
    trailing_comma = ","
    if i >= len(new_tags_list) - 1:
        trailing_comma = ""
    print("        {\"name\": \"%s\", \"color\": \"%s\"}%s" % (new_tag["name"], new_tag["color"], trailing_comma))
print("    ]")

print("}")
