
# This program is the glue between PrairieLearn core JavaScript code and question Python code
#
# It will load a single Python file and call one top-level function in it,
# passing a list of arguments and returning the entire return value of the function
#
# Input is formatted as JSON on STDIN
# Output is formatted as JSON on file descriptor 3
# Anything written to STDOUT or STDERR will be captured and logged, but it has no meaning
# Errors are signaled by exiting with non-zero exit code
# Exceptions are not caught and so will trigger a process exit with non-zero exit code (signaling an error)

import sys, os, json, importlib

json_inp = sys.stdin.read()
inp = json.loads(json_inp)

file = inp['file']
fcn = inp['fcn']
args = inp['args']
cwd = inp['cwd']
pylibdir = inp['pylibdir']

sys.path.insert(0, pylibdir)
sys.path.insert(0, cwd)
mod = importlib.import_module(file);
method = getattr(mod, fcn)
output = method(*args)
json_outp = json.dumps(output)
with open(3, 'w', encoding='utf-8') as outf:
    outf.write(json_outp)
