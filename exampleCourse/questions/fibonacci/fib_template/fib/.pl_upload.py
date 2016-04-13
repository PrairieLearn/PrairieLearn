#!/usr/bin/env python
import base64
import json
import sys

if sys.version_info[0] < 3:
    import ConfigParser as configparser
    from urllib2 import Request, urlopen, URLError, HTTPError
else:
    import configparser
    from urllib.request import Request, urlopen
    from urllib.error import URLError, HTTPError

red = lambda s: '\033[31m%s\033[39m' % s
green = lambda s: '\033[32m%s\033[39m' % s
underline = lambda s: '\033[4m%s\033[24m' % s

config = configparser.RawConfigParser()
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
        fib_py_b64 = base64.b64encode(f.read().encode('utf-8'))
except IOError:
    sys.exit('%s: fib.py not found' % red(underline('Error')))

submission = json.dumps({
    'submittedAnswer': {
        'fileData': fib_py_b64.decode('ascii'),
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
req = Request(url, data=submission.encode('utf-8'), headers=headers)

try:
    r = urlopen(req)
    print('Uploaded successfully to %s as %s.' % (
        green(qid), green('%s <%s>' % (auth_name, auth_uid))))
except URLError as e:
    sys.exit('%s: %s' % (red(underline('Error')), e.reason))
except HTTPError as e:
    sys.exit('%s: %s' % (red(underline('Error')), e.read()))
