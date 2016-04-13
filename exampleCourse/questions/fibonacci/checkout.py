#!/usr/bin/env python
import os
import sys
import tarfile

if sys.version_info[0] < 3:
    import ConfigParser as configparser
    from urllib2 import Request, urlopen
else:
    import configparser
    from urllib.request import Request, urlopen

dir_name = 'fib'
archive_name = 'fib.tar.gz'
base_url = 'http://localhost:3000'

red = lambda s: '\033[31m%s\033[39m' % s
green = lambda s: '\033[32m%s\033[39m' % s
underline = lambda s: '\033[4m%s\033[24m' % s

auth_uid = """<%= authUID %>"""
auth_name = """<%= authName %>"""
auth_date = """<%= authDate %>"""
auth_signature = """<%= authSignature %>"""

user_uid = """<%= userUID %>"""
qid = """<%= qid %>"""
qiid = """<%= qiid %>"""
tiid = """<%= tiid %>"""

if os.path.isdir(dir_name):
    print('%s: You have already checked out the problem code.' % (
        red(underline('Error'))))
    print('If you want to replace your code with a clean copy, run `rm -rf %s`.' %
          dir_name)
    sys.exit(1)

url = '%s/qInstances/%s/%s' % (base_url, qiid, archive_name)
headers = {
    'X-Auth-UID': auth_uid,
    'X-Auth-Name': auth_name,
    'X-Auth-Date': auth_date,
    'X-Auth-Signature': auth_signature,
}
req = Request(url, headers=headers)
f = urlopen(req)

with tarfile.open(fileobj=f, mode='r|gz') as tar:
    tar.extractall()

config = configparser.RawConfigParser()

config.add_section('PrairieLearn')
config.set('PrairieLearn', 'base_url', base_url)

config.add_section('Authentication')
config.set('Authentication', 'auth_uid', auth_uid)
config.set('Authentication', 'auth_name', auth_name)
config.set('Authentication', 'auth_date', auth_date)
config.set('Authentication', 'auth_signature', auth_signature)

config.add_section('Question')
config.set('Question', 'user_uid', user_uid)
config.set('Question', 'qid', qid)
config.set('Question', 'qiid', qiid)
config.set('Question', 'tiid', tiid)

with open(dir_name + '/.pl_upload.cfg', 'w') as configfile:
    config.write(configfile)

print('Problem code has been checked out to %s.' % green(os.path.abspath(dir_name)))
print('Run `make upload` to upload your code to PrairieLearn.')
