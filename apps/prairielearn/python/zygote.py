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

import base64
import copy
import io
import json
import os
import signal
import subprocess
import sys
import time
import types
from importlib.abc import MetaPathFinder
from inspect import signature
from typing import Any, Iterable, Sequence

import question_phases
import zygote_utils as zu

saved_path = copy.copy(sys.path)

drop_privileges = os.environ.get("DROP_PRIVILEGES", False)

# If we're configured to drop privileges (that is, if we're running in a
# Docker container), various tools like matplotlib and fontconfig will be
# unable to write to their default config/cache directories. This is because
# the `$HOME` environment variable still points to `/root`, which is not
# writable by the `executor` user.
#
# To work around this, we'll set `$XDG_CONFIG_HOME` and `$XDG_CACHE_HOME` to
# directories created in `/tmp` that are world-writable. matplotlib and
# fontconfig should respect these environment variables; other tools should as
# well. If they don't, special cases can be added below.
if drop_privileges:
    config_home_path = "/tmp/xdg_config"
    cache_home_path = "/tmp/xdg_cache"

    oldmask = os.umask(000)

    os.makedirs(config_home_path, mode=0o777, exist_ok=True)
    os.makedirs(cache_home_path, mode=0o777, exist_ok=True)

    os.umask(oldmask)

    os.environ["XDG_CONFIG_HOME"] = config_home_path
    os.environ["XDG_CACHE_HOME"] = cache_home_path

# Silence matplotlib's FontManager logs; these can cause trouble with our
# expectation that code execution doesn't log anything to stdout/stderr.
import logging

logging.getLogger("matplotlib.font_manager").disabled = True

# Pre-load commonly used modules
sys.path.insert(0, os.path.abspath("../question-servers/freeformPythonLib"))
import html
import math
import random

import chevron
import lxml.html
import matplotlib
import matplotlib.font_manager
import nltk
import numpy
import pint
import prairielearn
import sklearn

matplotlib.use("PDF")

# Construct initial unit registry to create initial cache file.
prairielearn.get_unit_registry()


# We want to conditionally allow/block importing specific modules, namely `rpy2`.
# This custom importer will allow us to do so, and throw a custom error message.
#
# While this won't prevent anything more complex than an `import` statement, it
# will make it clear to the user that they're not allowed to use `rpy2`. If they
# try to bypass the block, it's up to them to deal with the consequences.
class ForbidModuleMetaPathFinder(MetaPathFinder):
    def __init__(self) -> None:
        self.forbidden_modules: set[str] = set()

    def forbid_modules(self, forbidden_module: Iterable[str]) -> None:
        self.forbidden_modules.update(forbidden_module)

    def reset_forbidden_modules(self) -> None:
        self.forbidden_modules.clear()

    def find_spec(
        self,
        fullname: str,
        path: Sequence[str] | None,
        target: types.ModuleType | None = None,
    ):
        if any(
            fullname == module or fullname.startswith(module + ".")
            for module in self.forbidden_modules
        ):
            raise ImportError(f'module "{fullname}" is not allowed.')
        return None


# This function tries to convert a python object to valid JSON. If an exception
# is raised, this function prints the object and re-raises the exception. This is
# helpful because the object - which contains something that cannot be converted
# to JSON - would otherwise never be displayed to the developer, making it hard to
# debug the problem.
def try_dumps(obj: Any, sort_keys=False, allow_nan=False):
    try:
        zu.assert_all_integers_within_limits(obj)
        return json.dumps(obj, sort_keys=sort_keys, allow_nan=allow_nan)
    except Exception:
        print(f"Error converting this object to json:\n{obj}\n")
        raise


def worker_loop() -> None:
    # Whether the PRNGs have already been seeded in this worker_loop() call
    seeded = False

    path_finder = ForbidModuleMetaPathFinder()
    sys.meta_path.insert(0, path_finder)

    # file descriptor 3 is for output data
    with open(3, "w", encoding="utf-8") as outf:
        # Infinite loop where we wait for an input command, do it, and
        # return the results. The caller should terminate us with a
        # SIGTERM.
        while True:
            # wait for a single line of input
            json_inp = sys.stdin.readline()
            # unpack the input line as JSON
            inp = json.loads(json_inp, parse_int=zu.safe_parse_int)

            # get the contents of the JSON input
            file = inp.get("file", None)
            fcn = inp.get("fcn", None)
            args = inp.get("args", None)
            cwd = inp.get("cwd", None)
            paths = inp.get("paths", None)
            forbidden_modules = inp.get("forbidden_modules", None)

            # Wire up the custom importer to forbid modules as needed.
            path_finder.reset_forbidden_modules()
            if forbidden_modules is not None and isinstance(forbidden_modules, list):
                path_finder.forbid_modules(forbidden_modules)

            # "ping" is a special fake function name that the parent process
            # will use to check if the worker is active and able to respond to
            # calls. We just reply with "pong" to indicate that we're alive.
            if file is None and fcn == "ping":
                json.dump({"present": True, "val": "pong"}, outf)
                outf.write("\n")
                outf.flush()
                continue

            # "restart" is a special fake function name that causes
            # the forked worker to exit, returning control to the
            # zygote parent process
            if file is None and fcn == "restart":
                json.dump({"present": True, "val": "success"}, outf)
                outf.write("\n")
                outf.flush()

                # `sys.exit()` allows the process to gracefully shut down. however, that
                # makes things much slower than necessary, because we can't reuse this
                # worker until control returns to the parent, and one or more things we
                # load into the process take on the order of hundreds of milliseconds to
                # clean themselves up. `os._exit()` is much closer to a POSIX `exit()`
                # since it will immediately terminate the process - in our case, we don't
                # care about graceful termination, we just want to get out of here as
                # fast as possible.
                os._exit(0)

            if file.endswith(".js"):
                # We've shoehorned legacy v2 questions into the v3 code caller
                # so that we can reuse the same worker processes, and specifically
                # so that we can reuse the container pool.
                #
                # Node doesn't support POSIX-style forks, so we can't use a zygote
                # process like we do with Python. Instead, we'll exec a Node subprocess.
                # Node generally boots up very quickly, so this should be fine.
                result = subprocess.run(
                    [
                        "node",
                        "./apps/prairielearn/dist/question-servers/calculation-worker.js",
                    ],
                    cwd=cwd,
                    capture_output=True,
                    # By convention, the first argument is an object that contains all
                    # the call information.
                    input=json.dumps(args[0]),
                    encoding="utf-8",
                )

                # Proxy any output from the subprocess back to the caller.
                # Note that we only deal with stderr, as the Node process rewrote
                # the output streams so that writes to stdout actually go to stderr.
                # This allows us to use stdout for the actual return value.
                if result.stderr:
                    print(result.stderr, file=sys.stderr)
                    sys.stderr.flush()

                # If the subprocess exited with a non-zero exit code, raise an exception.
                result.check_returncode()

                outf.write(result.stdout)
                outf.write("\n")
                outf.flush()
                continue

            # Here, we re-seed the PRNGs if not already seeded in this worker_loop() call.
            # We only want to seed the PRNGs once per worker_loop() call, so that if a
            # question happens to contain multiple occurrences of the same element, the
            # randomizations for each occurrence are independent of each other but still
            # dependent on the variant seed.
            if type(args[-1]) is dict and not seeded:
                variant_seed = args[-1].get("variant_seed", None)
                random.seed(variant_seed)
                numpy.random.seed(variant_seed)
                seeded = True

            # reset and then set up the path
            sys.path = copy.copy(saved_path)
            for path in reversed(paths):
                sys.path.insert(0, path)
            sys.path.insert(0, cwd)

            # change to the desired working directory
            os.chdir(cwd)

            if file == "question.html":
                # This is an experimental implementation of question processing
                # that does all HTML parsing and rendering in Python. This should
                # be much faster than the current implementation that does an IPC
                # call for each element.

                data = args[0]
                context = args[1]

                result, processed_elements = question_phases.process(fcn, data, context)
                val = {
                    "html": result if fcn == "render" else None,
                    "file": result if fcn == "file" else None,
                    "data": data,
                    "processed_elements": list(processed_elements),
                }

                # make sure all output streams are flushed
                sys.stderr.flush()
                sys.stdout.flush()

                # write the return value (JSON on a single line)
                outf.write(try_dumps({"present": True, "val": val}))
                outf.write("\n")
                outf.flush()

                continue

            mod = {}
            file_path = os.path.join(cwd, file + ".py")
            with open(file_path, encoding="utf-8") as inf:
                # use compile to associate filename with code object, so the
                # filename appears in the traceback if there is an error
                # (https://stackoverflow.com/a/437857)
                code = compile(inf.read(), file_path, "exec")
                exec(code, mod)

            # check whether we have the desired fcn in the module
            if fcn in mod:
                # get the desired function in the loaded module
                method = mod[fcn]

                # check if the desired function is a legacy element function - if
                # so, we add an argument for element_index
                arg_names = list(signature(method).parameters.keys())
                if (
                    len(arg_names) == 3
                    and arg_names[0] == "element_html"
                    and arg_names[1] == "element_index"
                    and arg_names[2] == "data"
                ):
                    args.insert(1, None)

                # call the desired function in the loaded module
                val = method(*args)

                if fcn == "file":
                    # if val is None, replace it with empty string
                    if val is None:
                        val = ""
                    # if val is a file-like object, read whatever is inside
                    if isinstance(val, io.IOBase):
                        val.seek(0)
                        val = val.read()
                    # if val is a string, treat it as utf-8
                    if isinstance(val, str):
                        val = bytes(val, "utf-8")
                    # if this next call does not work, it will throw an error, because
                    # the thing returned by file() does not have the correct format
                    val = base64.b64encode(val).decode()

                # Any function that is not 'file' or 'render' will modify 'data' and
                # should not be returning anything (because 'data' is mutable).
                if (fcn != "file") and (fcn != "render"):
                    if val is None:
                        json_outp = try_dumps(
                            {"present": True, "val": args[-1]}, allow_nan=False
                        )
                    else:
                        json_outp_passed = try_dumps(
                            {"present": True, "val": args[-1]},
                            sort_keys=True,
                            allow_nan=False,
                        )
                        json_outp = try_dumps(
                            {"present": True, "val": val},
                            sort_keys=True,
                            allow_nan=False,
                        )
                        if json_outp_passed != json_outp:
                            sys.stderr.write(
                                'WARNING: Passed and returned value of "data" differ in the function '
                                + str(fcn)
                                + "() in the file "
                                + str(cwd)
                                + "/"
                                + str(file)
                                + ".py.\n\n passed:\n  "
                                + str(args[-1])
                                + "\n\n returned:\n  "
                                + str(val)
                                + '\n\nThere is no need to be returning "data" at all (it is mutable, i.e., passed by reference). In future, this code will throw a fatal error. For now, the returned value of "data" was used and the passed value was discarded.'
                            )
                else:
                    json_outp = try_dumps(
                        {"present": True, "val": val}, allow_nan=False
                    )
            else:
                # the function wasn't present, so report this
                json_outp = try_dumps({"present": False}, allow_nan=False)

            # make sure all output streams are flushed
            sys.stderr.flush()
            sys.stdout.flush()

            # write the return value (JSON on a single line)
            outf.write(json_outp)
            outf.write("\n")
            outf.flush()


worker_pid = 0


def terminate_worker(signum: int, stack: types.FrameType | None) -> None:
    if worker_pid > 0:
        os.kill(worker_pid, signal.SIGKILL)
    os._exit(0)


signal.signal(signal.SIGTERM, terminate_worker)
signal.signal(signal.SIGINT, terminate_worker)  # Ctrl-C case

with open(4, "w", encoding="utf-8") as exitf:
    while True:
        worker_pid = os.fork()
        if worker_pid == 0:
            # Ensure that no code running in the worker can interact with
            # file descriptor 4
            exitf.close()

            # If configured to do so, drop to a deprivileged user before running
            # any user code. This should generally only be enabled when running
            # in Docker, as the `prairielearn/executor` image will be guaranteed
            # to have the user that we drop to.
            if drop_privileges:
                import pwd

                user = pwd.getpwnam("executor")
                os.setgid(user.pw_gid)
                os.setuid(user.pw_uid)

            worker_loop()

            break
        else:
            pid, status = os.waitpid(worker_pid, 0)
            worker_pid = 0
            if os.WIFEXITED(status):
                if os.WEXITSTATUS(status) == 0:
                    # Everything is ok, the worker exited gracefully,
                    # just repeat

                    exited = True

                    # Once this child exits, clean up after it if we
                    # were running as the `executor` user
                    if drop_privileges:
                        # Kill all processes started by `executor`.
                        os.system("pkill -u executor --signal SIGKILL")

                        # Check that all processes are gone. If they're not,
                        # that probably means that someone is trying to escape
                        # by repeatedly forking. In that case, we'll refuse to
                        # write an exit confirmation to FD 4. This process will
                        # be killed, and if we're running inside a Docker container,
                        # the entire container should be killed too.
                        import psutil

                        if any(
                            p.username() == "executor" for p in psutil.process_iter()
                        ):
                            raise Exception(
                                "found remaining processes belonging to executor user"
                            )

                    # We'll need to write a confirmation message on file
                    # descriptor 4 so that PL knows that control was actually
                    # returned to the zygote.
                    json.dump({"exited": True}, exitf)
                    exitf.write("\n")
                    exitf.flush()
                else:
                    # The worker did not exit gracefully
                    raise Exception(
                        "worker process exited unexpectedly with status %d" % status
                    )
            else:
                # Something else happened that is weird
                raise Exception(
                    "worker process exited unexpectedly with status %d" % status
                )
