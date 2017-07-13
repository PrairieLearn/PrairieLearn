
import sys, os, json, importlib

json_inp = sys.stdin.read()
inp = json.loads(json_inp)

file = inp['file']
fcn = inp['fcn']
args = inp['args']
cwd = inp['cwd']

sys.path.insert(0, cwd)
mod = importlib.import_module(file);
method = getattr(mod, fcn)
output = method(*args)
json_outp = json.dumps(output)
with open(3, 'w', encoding='utf-8') as outf:
    outf.write(json_outp)
