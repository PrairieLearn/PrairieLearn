#!/usr/bin/env python2
import ConfigParser
import base64
import json
import sys
import urllib2

red = lambda s: '\033[31m%s\033[39m' % s
green = lambda s: '\033[32m%s\033[39m' % s
underline = lambda s: '\033[4m%s\033[24m' % s

config = ConfigParser.ConfigParser()
config.read('.pl_upload.cfg')

auth_uid = config.get('Authentication', 'auth_uid')
auth_name = config.get('Authentication', 'auth_name')
auth_date = config.get('Authentication', 'auth_date')
auth_signature = config.get('Authentication', 'auth_signature')

user_uid = config.get('Question', 'user_uid')
qid = config.get('Question', 'qid')
qiid = config.get('Question', 'qiid')
tiid = config.get('Question', 'tiid')

fib_py_b64 = ''

try:
    with open('fib.py') as f:
        fib_py_b64 = base64.b64encode(f.read())
except IOError:
    sys.exit('%s: fib.py not found' % red(underline('Error')))

submission = json.dumps({
    'submittedAnswer': {
        'fileData': fib_py_b64,
    },
    'uid': user_uid,
    'qid': qid,
    'qiid': qiid,
    'tiid': tiid,
})

url = 'http://localhost:3000/submissions'
headers = {
    'X-Auth-UID': auth_uid,
    'X-Auth-Name': auth_name,
    'X-Auth-Date': auth_date,
    'X-Auth-Signature': auth_signature,
    'Content-Type': 'application/json',
}
req = urllib2.Request(url, data=submission, headers=headers)

try:
    r = urllib2.urlopen(req)
    print 'Uploaded successfully to %s as %s.' % (
            green(qid), green('%s <%s>' % (auth_name, auth_uid)))
except urllib2.URLError as e:
    sys.exit('%s: %s' % (red(underline('Error')), e.reason))
except urllib2.HTTPError as e:
    sys.exit('%s: %s' % (red(underline('Error')), e.read()))
