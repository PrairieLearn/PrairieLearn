
# This program is the glue between python-runner JavaScript code and Python code
#
# It will enter an infinite loop waiting for input. For each input, it
# will load a single Python file and call one top-level function in
# it, passing a list of arguments and returning the entire return
# value of the function.
#
# It is intended that this process will be terminated by sending
# SIGTERM (or SIGKILL if it's stuck).
#
# Input is formatted as JSON on STDIN
# Output is formatted as JSON on file descriptor 3
# Anything written to STDOUT or STDERR will be captured and logged, but it has no meaning
# Errors are signaled by exiting with non-zero exit code
# Exceptions are not caught and so will trigger a process exit with non-zero exit code (signaling an error)

import sys, os, json, importlib, copy

saved_path = copy.copy(sys.path)

while True:
    json_inp = sys.stdin.readline()
    inp = json.loads(json_inp)

    file = inp['file']
    fcn = inp['fcn']
    args = inp['args']
    cwd = inp['cwd']
    paths = inp['paths']

    sys.path = copy.copy(saved_path)
    for path in reversed(paths):
        sys.path.insert(0, path)
    sys.path.insert(0, cwd)
    os.chdir(cwd)
    mod = importlib.import_module(file);
    method = getattr(mod, fcn)
    output = method(*args)
    sys.stderr.flush()
    sys.stdout.flush()
    json_outp = json.dumps(output)
    with open(3, 'w', encoding='utf-8') as outf:
        outf.write(json_outp)
        outf.write("\n");
        outf.flush()
