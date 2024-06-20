#!/usr/bin/env python

"""
Conversion script to take PLv1 assessment and make PLv2 assessments,
including directory structure.

Tests on RetryExams and Game mode homeworks. I've tried to grab all of the
appropriate data from the info.json files to convert into the new forms, but
it's possible I've missed options that I (or my other testers) do not currently use.

Written for python3 (3.4); appears to be compatible with python2 (2.7).
"""

__author__ = 'Dallas R. Trinkle'

import json, uuid, re, os
from collections import OrderedDict

def convquestion(quesdict):
    """Code to take a single question and return a new version"""
    newq = OrderedDict()
    if 'points' in quesdict:
        plist = quesdict['points']
    else:
        plist = quesdict['initValue']
    if type(plist) is list and len(plist) == 1:
        points = plist[0]
    else:
        points = plist
    if "qid" in quesdict:
        newq['id'] = quesdict['qid']
        newq['points'] = points
        if 'maxScore' in quesdict:
            newq['maxPoints'] = quesdict['maxScore']
    else:
        newq['numberChoose'] = 1
        newq['points'] = points
        if 'maxScore' in quesdict:
            newq['maxPoints'] = quesdict['maxScore']
        newq['alternatives'] = [{'id': q} for q in quesdict['qids']]
    return newq

def convzone(zdict):
    """Code to take a single zone and return a new version"""
    newz = OrderedDict()
    if 'title' in zdict: newz['title'] = zdict['title']
    newz['questions'] = [convquestion(q) for q in zdict['questions']]
    return newz

def convassessment(assessdict):
    """Code to convert an assessment"""
    # search and replace: (\s == whitespace)
    p1 = re.compile(r'<\%\s+print\(\s*clientFile\s*\(\s*"([^"]+)\s*"\s*\)\s*\)\s+\%>')
    r1 = r'<%= clientFilesCourse %>/\1'
    p2 = re.compile(r'<\%\s+print\(\s*testFile\s*\(\s*"([^"]+)\s*"\s*\)\s*\)\s+\%>')
    r2 = r'<%= clientFilesAssessment %>/\1'

    options = assessdict['options']
    newdict = OrderedDict()
    newdict['uuid'] = str(uuid.uuid4())
    if 'Exam' in assessdict['type']:
        newdict['type'] = 'Exam'
    else:
        newdict['type'] = 'Homework'
    newdict['title'] = assessdict['title']
    newdict['set'] = assessdict['set']
    newdict['number'] = str(assessdict['number'])
    if 'allowPractice' in options: newdict['multipleInstance'] = options['allowPractice']
    if 'maxScore' in options: newdict['maxPoints'] = options['maxScore']
    newdict['allowAccess'] = assessdict['allowAccess']
    # exams always have zones; Game mode did not have zones so we have to make one:
    if 'zones' in options:
        newdict['zones'] = [convzone(z) for z in options['zones']]
    else:
        newdict['zones'] = [{'questions': [convquestion(q) for q in options['questions']]}]        
    if 'text' in options: newdict['text'] = p2.sub(r2, p1.sub(r1, options['text']))
    return newdict

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(
        description='Convert a directory full of assessments from PLv1 into PLv2 compliant form',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Example: PLv1 assessments directory called 'tests', and you want to create PLv2
'courseInstances/Fa16' then:

python assess-convert.py tests coursesInstances/Fa16

will create an 'assessments' subdirectory in 'courseInstances/Fa16' and place
converted infoAssessment.json files in correspondingly named directories.

By default, does not overwrite existing infoAssessment.json files; use -f instead.
""")
    parser.add_argument('sourcedir', help='source directory of assessments ("tests")')
    parser.add_argument('targetdir', help='target course instance, without the "assessments" directory')
    parser.add_argument('--force', '-f', action='store_true',
                        help='force overwrite of existing assessments if found')
    parser.add_argument('--quiet', '-q', action='store_true',
                        help='do not report what is happening')
    args = parser.parse_args()

    sourcedir = args.sourcedir
    targetdir = os.path.join(args.targetdir, "assessments")

    for assessment in os.listdir(sourcedir):
        adir = os.path.join(sourcedir, assessment)
        if not os.path.isdir(adir): continue
        source = os.path.join(adir, 'info.json')
        tdir = os.path.join(targetdir, assessment)
        target = os.path.join(tdir, 'infoAssessment.json')
        try:
            with open(source, 'r') as f:
                if not args.quiet:
                    print('Converting assessment {} in {} to {}'.format(assessment, adir, tdir))
                try:
                    if not os.path.isdir(tdir):
                        os.makedirs(tdir)  # 3.4 option: exist_ok=True
                except:
                    print('Error making directory {}'.format(tdir))
                if not args.force:
                    if os.path.isfile(target):
                        if not args.quiet:
                            print('Existing assessment {}; skipping'.format(target))
                        continue
                try:
                    with open(target, 'w') as out:
                        json.dump(convassessment(json.load(f)), out, indent=4)
                except:
                    print('Error converting {} to {}. Could be file writing or JSON'.format(source, target))
        except:
            if not args.quiet:
                print('Directory {} does not have a readable info.json file?'.format(adir))
    
