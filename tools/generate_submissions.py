#! /usr/bin/python3

# Generates blank submissions for all students in an assessment. This
# can be used in local testing where having several submissions is
# beneficial. It works by obtaining a list of all students and staff
# in the course and, for each of these users, open the assessment with
# the student as the effective user, then opening each instance
# question in the assessment and triggering the equivalent of pressing
# the "Save" button in the submission without changing any values.
#
# This script benefits from running after the course instance has been
# populated with students, which can be done with the
# generate_and_enroll_users admin query. If grading is expected, it is
# possible to, after running this script, select the "Grade all
# instances" in the assessment's Students tab, though note that in
# most cases grading will not be possible since answers are left
# blank.
#
# Running this script multiple times is possible, and will cause a new
# submission to be created for all students in each
# question. Assessments that were already closed will not have new
# submissions created, though it is possible to use the assessment's
# Students tab to change the remaining time for all instances, which
# has the option to re-open all closed assessment instances.

import argparse, json
import requests
from lxml import html

def get_csrf_token(url):
    pass # parser = etree

def main():
    parser = argparse.ArgumentParser(description="Generate blank submissions for all students in an assessment.")
    parser.add_argument("-i", "--course-instance", required=True, type=int, help="course instance where students are enrolled")
    parser.add_argument("-a", "--assessment", required=True, type=int, help="assessment ID where submissions should be added")
    parser.add_argument("--host", default="localhost:3000", help="Host part (e.g., 'localhost:3000') of URL where PrairieLearn is running")
    args = parser.parse_args()

    base_url = f'http://{args.host}/pl/course_instance/{args.course_instance}'

    # Get list of students from gradebook page
    url = f'{base_url}/instructor/instance_admin/gradebook/raw_data.json'
    with requests.get(url) as response:
        grades = json.loads(response.text)

    for uid in [g['uid'] for g in grades]:
        print(f'Generating submissions for {uid}...')
        cookies = {
            'pl_requested_uid': uid,
            'pl_requested_course_instance_role': 'Student Data Editor',
            'pl_requested_course_role': 'Owner'
        }
        url = f'{base_url}/assessment/{args.assessment}'
        with requests.get(url, cookies=cookies) as response:
            root = html.document_fromstring(response.text)
            for start in root.cssselect(f'#confirm-form'):
                # Need to start assessment (confirm form)
                data = {i.get('name'): i.get('value') for i in root.cssselect(f'input') if i.get('name')}
                with requests.post(url, cookies=cookies, data=data) as response:
                    pass
            
        with requests.get(url, cookies=cookies) as response:
            root = html.document_fromstring(response.text)
            for iq in root.cssselect(f'a[href^="/pl/course_instance/{args.course_instance}/instance_question/"]'):
                url = f'http://{args.host}' + iq.get('href')
                with requests.get(url, cookies=cookies) as response:
                    root = html.document_fromstring(response.text)
                    data = {i.get('name'): i.get('value') for i in root.cssselect(f'input') if i.get('name')}
                    data['__action'] = 'save'
                    with requests.post(url, cookies=cookies, data=data) as response:
                        pass

if __name__ == '__main__':
    main()
