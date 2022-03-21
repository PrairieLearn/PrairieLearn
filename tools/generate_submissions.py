#! /usr/bin/python3

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
            for iq in root.cssselect(f'a[href^="/pl/course_instance/{args.course_instance}/instance_question/"]'):
                url = f'http://{args.host}' + iq.get('href')
                with requests.get(url, cookies=cookies) as response:
                    root = html.document_fromstring(response.text)
                    csrf_token = root.get_element_by_id('test_csrf_token').text_content().strip()
                    data = {i.get('name'): i.get('value') for i in root.cssselect(f'input') if i.get('name')}
                    data['__action'] = 'save'
                    with requests.post(url, cookies=cookies, data=data) as response:
                        pass

if __name__ == '__main__':
    main()
