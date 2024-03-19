#! /usr/bin/python3

import json
import os
import pathlib
import re
import shlex
import subprocess
import tempfile
from typing import Literal

import lxml.etree as ET

CODEBASE = "/grade/student"
DATAFILE = "/grade/data/data.json"
SB_USER = "sbuser"

# List of symbols that are not allowed to be used in student code
INVALID_SYMBOLS = frozenset(
    (
        "__asan_default_options",
        "__asan_on_error",
        "__asan_malloc_hook",
        "__asan_free_hook",
        "__asan_unpoison_memory_region",
        "__asan_set_error_exit_code",
        "__asan_set_death_callback",
        "__asan_set_error_report_callback",
        "__msan_default_options",
        "__msan_malloc_hook",
        "__msan_free_hook",
        "__msan_unpoison",
        "__msan_unpoison_string",
        "__msan_set_exit_code",
        "__lsan_is_turned_off",
        "__lsan_default_suppressions",
        "__lsan_do_leak_check",
        "__lsan_disable",
        "__lsan_enable",
        "__lsan_ignore_object",
        "__lsan_register_root_region",
        "__lsan_unregister_root_region",
        "__sanitizer_set_death_callback",
        "__sanitizer_set_report_path",
        "__sanitizer_sandbox_on_notify",
    )
)
INVALID_PRIMITIVES = frozenset(("no_sanitize", "disable_sanitizer_instrumentation"))

ASAN_FLAGS = ("-fsanitize=address", "-static-libasan", "-g", "-O0")


OutputMatchingOption = Literal["all", "partial", "any"]


TIMEOUT_MESSAGE = """

TIMEOUT! Typically this means the program took too long,
requested more inputs than provided, or an infinite loop was found.
If your program is reading data using scanf inside a loop, this
could also mean that scanf does not support the input provided
(e.g., reading an int if the input is a double).
"""


class UngradableException(Exception):
    def __init__(self):
        pass


class CGrader:
    def __init__(self, compiler="gcc"):
        with open(DATAFILE) as file:
            self.data = json.load(file)
        self.compiler = compiler

    def run_command(self, command, input=None, sandboxed=True, timeout=None, env=None):
        if isinstance(command, str):
            command = shlex.split(command)
        if sandboxed:
            command = [
                "su",
                SB_USER,
                "-s",
                "/bin/bash",
                "-c",
                shlex.join(["PATH=" + self.path] + command),
            ]

        try:
            proc = subprocess.Popen(
                command,
                env=env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
        except Exception:
            return ""
        out = None
        tostr = ""
        if input is not None and not isinstance(input, (bytes, bytearray)):
            input = str(input).encode("utf-8")
        try:
            proc.communicate(input=input, timeout=timeout)[0]
        except subprocess.TimeoutExpired:
            tostr = TIMEOUT_MESSAGE
        finally:
            proc.kill()
            try:
                out = proc.communicate(timeout=timeout)[0]
            except subprocess.TimeoutExpired:
                tostr = TIMEOUT_MESSAGE
            finally:
                out = out.decode("utf-8", "backslashreplace") if out else ""
                return out + tostr

    def compile_file(
        self,
        c_file,
        exec_file=None,
        add_c_file=None,
        compiler=None,
        flags=None,
        pkg_config_flags=None,
        add_warning_result_msg=True,
        ungradable_if_failed=True,
        return_objects=False,
        enable_asan=False,
        reject_symbols=None,
        objcopy_args=None,
    ):
        cflags = flags
        if cflags and not isinstance(cflags, list):
            cflags = shlex.split(cflags)
        elif not cflags:
            cflags = []
        if enable_asan:
            cflags.extend(ASAN_FLAGS)

        if not add_c_file:
            add_c_file = []
        elif not isinstance(add_c_file, list):
            add_c_file = [add_c_file]

        if not compiler:
            compiler = self.compiler

        if pkg_config_flags:
            if isinstance(pkg_config_flags, str):
                pkg_config_flags = shlex.split(pkg_config_flags)
            out_flags = self.run_command(["pkg-config", "--cflags"] + pkg_config_flags)
            if out_flags:
                cflags.extend(shlex.split(out_flags))

        out = ""
        std_obj_files = []
        objs = []
        for std_c_file in c_file if isinstance(c_file, list) else [c_file]:
            obj_file = pathlib.Path(std_c_file).with_suffix(".o")
            std_obj_files.append(obj_file)
            out += self.run_command(
                [compiler, "-save-temps", "-c", std_c_file, "-o", obj_file] + cflags,
                sandboxed=False,
            )
            # Identify references to functions intended to disable sanitizers from object file
            if os.path.isfile(obj_file):
                # These primitives are checked in the .i file (the
                # preprocessed C file), which will have any #define
                # and #include primitives already expanded and
                # comments removed
                found_primitives = None
                preprocessed_file = pathlib.Path(std_c_file).with_suffix(".i")
                if not os.path.isfile(preprocessed_file):
                    preprocessed_file = pathlib.Path(std_c_file).with_suffix(".ii")
                if not os.path.isfile(preprocessed_file):
                    preprocessed_file = pathlib.Path(std_c_file).with_suffix(".mi")
                if os.path.isfile(preprocessed_file):
                    with open(preprocessed_file, "r") as f:
                        preprocessed_text = f.read()
                        found_primitives = {
                            s for s in INVALID_PRIMITIVES if s in preprocessed_text
                        }
                if found_primitives:
                    out += (
                        "\n\033[31mThe following unauthorized primitives were found in the submitted code:\n\t"
                        + ", ".join(found_primitives)
                        + "\033[0m"
                    )
                    os.unlink(obj_file)
                # nm -j will list any references to global symbols in
                # the object file, either from function definitions or
                # function calls.
                symbols = self.run_command(
                    ["nm", "-j", obj_file], sandboxed=False
                ).splitlines()
                found_symbols = (INVALID_SYMBOLS | set(reject_symbols or {})) & set(
                    symbols
                )
                if found_symbols:
                    out += (
                        "\n\033[31mThe following unauthorized function(s) and/or variable(s) were found in the submitted code:\n\t"
                        + ", ".join(found_symbols)
                        + "\033[0m"
                    )
                    os.unlink(obj_file)
                if objcopy_args:
                    self.run_command(
                        ["objcopy", obj_file] + objcopy_args, sandboxed=False
                    )

        if all(os.path.isfile(obj) for obj in std_obj_files):
            # Add new C files that maybe overwrite some existing functions.
            for added_c_file in add_c_file:
                obj_file = pathlib.Path(added_c_file).with_suffix(".o")
                out += self.run_command(
                    [compiler, "-c", added_c_file, "-o", obj_file] + cflags,
                    sandboxed=False,
                )
                objs.append(obj_file)

        if ungradable_if_failed and not all(
            os.path.isfile(f) for f in objs + std_obj_files
        ):
            self.result[
                "message"
            ] += f"Compilation errors, please fix and try again.\n\n{out}\n"
            raise UngradableException()
        if out and add_warning_result_msg:
            self.result["message"] += f"Compilation warnings:\n\n{out}\n"
        if exec_file:
            out += self.link_object_files(
                std_obj_files,
                objs,
                exec_file,
                compiler=compiler,
                flags=flags,
                pkg_config_flags=pkg_config_flags,
                add_warning_result_msg=add_warning_result_msg,
                ungradable_if_failed=ungradable_if_failed,
                enable_asan=enable_asan,
            )
        return (out, std_obj_files + objs) if return_objects else out

    def link_object_files(
        self,
        student_obj_files,
        add_obj_files,
        exec_file,
        compiler=None,
        flags=None,
        pkg_config_flags=None,
        add_warning_result_msg=True,
        ungradable_if_failed=True,
        enable_asan=False,
    ):
        if flags and not isinstance(flags, list):
            flags = shlex.split(flags)
        elif not flags:
            flags = []
        if enable_asan:
            flags.extend(ASAN_FLAGS)

        if not student_obj_files:
            student_obj_files = []
        elif not isinstance(student_obj_files, list):
            student_obj_files = [student_obj_files]

        if not add_obj_files:
            add_obj_files = []
        elif not isinstance(add_obj_files, list):
            add_obj_files = [add_obj_files]
        if add_obj_files:
            flags.append("-Wl,--allow-multiple-definition")

        if not compiler:
            compiler = self.compiler

        if pkg_config_flags:
            if isinstance(pkg_config_flags, str):
                pkg_config_flags = shlex.split(pkg_config_flags)
            out_flags = self.run_command(["pkg-config", "--libs"] + pkg_config_flags)
            if out_flags:
                flags.extend(shlex.split(out_flags))

        # The student C files must be the last so its functions can be overwritten
        out = self.run_command(
            [compiler]
            + add_obj_files
            + student_obj_files
            + ["-o", exec_file, "-lm"]
            + flags,
            sandboxed=False,
        )

        if os.path.isfile(exec_file):
            self.change_mode(exec_file, "755")
        elif ungradable_if_failed:
            self.result[
                "message"
            ] += f"Linker errors, please fix and try again.\n\n{out}\n"
            raise UngradableException()
        if out and add_warning_result_msg:
            self.result["message"] += f"Linker warnings:\n\n{out}\n"
        return out

    def test_compile_file(
        self,
        c_file,
        exec_file=None,
        main_file=None,
        add_c_file=None,
        compiler=None,
        points=1,
        field=None,
        flags=None,
        pkg_config_flags=False,
        name="Compilation",
        add_warning_result_msg=True,
        ungradable_if_failed=True,
        enable_asan=False,
        reject_symbols=None,
        objcopy_args=None,
    ):
        if not add_c_file:
            add_c_file = []
        elif not isinstance(add_c_file, list):
            add_c_file = [add_c_file]
        # Kept for compatibility reasons, but could be set as an added file
        if main_file:
            add_c_file.append(main_file)

        out, objects = self.compile_file(
            c_file,
            exec_file,
            add_c_file=add_c_file,
            compiler=compiler,
            flags=flags,
            pkg_config_flags=pkg_config_flags,
            add_warning_result_msg=add_warning_result_msg,
            ungradable_if_failed=ungradable_if_failed,
            return_objects=True,
            enable_asan=enable_asan,
            reject_symbols=reject_symbols,
            objcopy_args=objcopy_args,
        )
        success = (
            os.path.isfile(exec_file)
            if exec_file
            else all(os.path.isfile(f) for f in objects)
        )
        return self.add_test_result(
            name,
            output=out,
            points=points if success else 0,
            max_points=points,
            field=field,
        )

    def change_mode(self, file, mode="744", change_parent=True):
        file = os.path.abspath(file)
        self.run_command(["chmod", mode, file], sandboxed=False)
        parent = os.path.dirname(file)
        if change_parent and parent and not os.path.samefile(file, parent):
            self.change_mode(parent, "711")

    def test_send_in_check_out(self, *args, **kwargs):
        """Old deprecated function name,
        retained for compatibility reasons."""
        return self.test_run(*args, **kwargs)

    def test_run(
        self,
        command,
        input=None,
        exp_output=None,
        must_match_all_outputs: OutputMatchingOption | bool = "any",
        reject_output=None,
        field=None,
        ignore_case=True,
        timeout=1,
        size_limit=10240,
        ignore_consec_spaces=True,
        args=None,
        name=None,
        msg=None,
        max_points=1,
        highlight_matches=False,
    ):
        if args is not None:
            if not isinstance(args, list):
                args = [args]
            args = list(map(str, args))

        if name is None and input is not None:
            name = 'Test with input "%s"' % " ".join(input.splitlines())
        elif name is None and args is not None:
            name = 'Test with arguments "%s"' % " ".join(args)
        elif name is None and isinstance(command, list):
            name = "Test command: %s" % command[0]
        elif name is None:
            name = "Test command: %s" % command

        if exp_output is None:
            exp_output = []
            must_match_all_outputs = True
        elif not isinstance(exp_output, list):
            exp_output = [exp_output]

        if reject_output is None:
            reject_output = []
        elif not isinstance(reject_output, list):
            reject_output = [reject_output]

        if must_match_all_outputs is True:
            must_match_all_outputs = "all"
        elif must_match_all_outputs is False:
            must_match_all_outputs = "any"

        def compile_re(t):
            if isinstance(t, re.Pattern):
                return (t.pattern, t)
            # If t is not a string, convert it to its string representation
            t = str(t)
            return (
                t.strip(),
                re.compile(
                    (
                        "\\s+".join(map(re.escape, re.split("\\s+", t)))
                        if ignore_consec_spaces
                        else re.escape(t)
                    ),
                    re.I if ignore_case else 0,
                ),
            )

        exp_output = [compile_re(t) for t in exp_output]
        reject_output = [compile_re(t) for t in reject_output]

        out = self.run_command(
            command if args is None else ([command] + args),
            input,
            sandboxed=True,
            timeout=timeout,
        )

        outcmp = out
        if highlight_matches and out:
            for _, r in exp_output:
                out = r.sub(r"\033[32m\g<0>\033[0m", out)
            for _, r in reject_output:
                out = r.sub(r"\033[31m\g<0>\033[0m", out)
        if not out:
            out = "(NO OUTPUT)"
        elif not out.endswith("\n"):
            out += "\n(NO ENDING LINE BREAK)"

        if msg is None and exp_output:
            comment = (
                ""
                if len(exp_output) == 1
                else " one of" if must_match_all_outputs == "any" else " all of"
            )
            join_str = "\n\n" if any("\n" in t for t, _ in exp_output) else "\n\t"
            msg = f"Expected{comment}:{join_str}" + join_str.join(
                (
                    f"\033[32m{t}\033[0m"
                    if highlight_matches and r.search(outcmp) is not None
                    else t
                )
                for t, r in exp_output
            )
            if reject_output:
                join_str = (
                    "\n\n" if any("\n" in t for t, _ in reject_output) else "\n\t"
                )
                msg += f"\nBut not:{join_str}" + join_str.join(
                    (
                        f"\033[31m{t}\033[0m"
                        if highlight_matches and r.search(outcmp) is not None
                        else t
                    )
                    for t, r in reject_output
                )
        elif msg is None:
            msg = ""

        points = max_points
        if timeout and "TIMEOUT" in outcmp:
            points = 0
        elif size_limit and len(outcmp) > size_limit:
            out = out[0:size_limit] + "\nTRUNCATED: Output too long."
            points = 0
        elif any(r.search(outcmp) is not None for _, r in reject_output):
            points = 0
        elif must_match_all_outputs == "partial":
            points = (
                max_points
                * sum(1 if r.search(outcmp) is not None else 0 for _, r in exp_output)
                / len(exp_output)
            )
        elif not (all if must_match_all_outputs == "all" else any)(
            r.search(outcmp) is not None for _, r in exp_output
        ):
            points = 0

        return self.add_test_result(
            name,
            points=points,
            msg=msg,
            output=out,
            max_points=max_points,
            field=field,
        )

    def add_manual_grading(self, points=1, name=None, description=None):
        """Old deprecated function, retained for compatibility reasons."""
        if not name:
            name = "Manual Grading - to be reviewed by a human grader"
        if not description:
            description = "This code will be manually reviewed by a human grader. The points associated to this component will be added based on evaluation of code style, programming practices and other manully checked criteria."
        return self.add_test_result(name, description, points=0, max_points=points)

    def add_test_result(
        self,
        name,
        description="",
        points=True,
        msg="",
        output="",
        max_points=1,
        field=None,
        images=None,
    ):
        if not isinstance(points, (int, float)):
            points = max_points if points else 0.0
        test = {
            "name": name,
            "description": description,
            "points": points,
            "max_points": max_points,
            "output": output,
            "message": msg if msg else "",
        }
        if images and isinstance(images, list):
            test["images"] = images
        elif images:
            test["images"] = [images]
        self.result["tests"].append(test)
        self.result["points"] += points
        self.result["max_points"] += max_points

        if field is not None:
            if "partial_scores" not in self.result:
                self.result["partial_scores"] = {}
            if field not in self.result["partial_scores"]:
                self.result["partial_scores"][field] = {
                    "points": points,
                    "max_points": max_points,
                }
            else:
                self.result["partial_scores"][field]["points"] += points
                self.result["partial_scores"][field]["max_points"] += max_points
        return test

    def run_check_suite(
        self,
        exec_file,
        args=None,
        use_suite_title=False,
        use_case_name=True,
        use_unit_test_id=True,
        use_iteration=False,
        sandboxed=False,
        use_malloc_debug=False,
        env=None,
    ):
        if not args:
            args = []
        if not isinstance(args, list):
            args = [args]

        if not env:
            env = {}
        env["TEMP"] = "/tmp"

        log_file_dir = tempfile.mkdtemp()
        log_file = os.path.join(log_file_dir, "tests.xml")
        env["CK_XML_LOG_FILE_NAME"] = log_file

        if sandboxed:
            self.change_mode(log_file_dir, "777", change_parent=False)
        else:
            env["SANDBOX_UID"] = self.run_command("id -u")
            env["SANDBOX_GID"] = self.run_command("id -g")

        if use_malloc_debug:
            env["LD_PRELOAD"] = "/lib/x86_64-linux-gnu/libc_malloc_debug.so"

        out = self.run_command([exec_file] + args, env=env, sandboxed=sandboxed)

        print(out)  # Printing so it shows in the grading job log

        # Copy log file to results directory so it becomes available to the instructor after execution
        out = self.run_command(["mkdir", "-p", "/grade/results"], sandboxed=False)
        out = self.run_command(
            ["cp", log_file, "/grade/results/check_log.xml", "--backup=numbered"],
            sandboxed=False,
        )
        print(out)

        separator_1 = ": " if use_suite_title and use_case_name else ""
        separator_2 = (
            " - " if use_unit_test_id and (use_suite_title or use_case_name) else ""
        )
        try:
            with open(log_file, "r", errors="backslashreplace") as log:
                tree = ET.parse(log, parser=ET.XMLParser())
            for suite in tree.getroot().findall("{*}suite"):
                suite_title = suite.findtext("{*}title") if use_suite_title else ""
                for test in suite.findall("{*}test"):
                    result = test.get("result")
                    test_id = test.findtext("{*}id") if use_unit_test_id else ""
                    iteration = (
                        f" (run {test.findtext('{*}iteration')})"
                        if use_iteration
                        else ""
                    )
                    case_name = test.findtext("{*}description") if use_case_name else ""
                    self.add_test_result(
                        f"{suite_title}{separator_1}{case_name}{separator_2}{test_id}{iteration}",
                        points=result == "success",
                        output=test.findtext("{*}message"),
                    )
        except FileNotFoundError:
            self.result[
                "message"
            ] += "Test suite log file not found. Consult the instructor.\n"
            raise UngradableException()
        except ET.ParseError as e:
            self.result["message"] += f"Error parsing test suite log.\n\n{e}\n"
            raise UngradableException()

    def save_results(self):
        if self.result["max_points"] > 0:
            self.result["score"] = self.result["points"] / self.result["max_points"]
        if "partial_scores" in self.result:
            for field, ps in self.result["partial_scores"].items():
                ps["score"] = ps["points"] / ps["max_points"]

        if not os.path.exists("/grade/results"):
            os.makedirs("/grade/results")
        with open("/grade/results/results.json", "w") as resfile:
            json.dump(self.result, resfile)

    def start(self):
        self.result = {
            "score": 0.0,
            "points": 0,
            "max_points": 0,
            "output": "",
            "message": "",
            "gradable": True,
            "tests": [],
        }

        os.chdir(CODEBASE)

        self.path = "/cgrader:" + os.environ["PATH"]

        self.run_command("chmod -R 700 /grade", sandboxed=False)

        # Create a fake "pause" command so students with 'system("PAUSE")' don't get an error
        with open("/cgrader/PAUSE", "w") as f:
            f.write("#! /bin/sh\n")
        self.change_mode("/cgrader/PAUSE", "755")
        self.run_command(
            ["ln", "-s", "/cgrader/PAUSE", "/cgrader/pause"], sandboxed=False
        )
        self.run_command(
            ["ln", "-s", "/cgrader/PAUSE", "/cgrader/Pause"], sandboxed=False
        )

        try:
            self.tests()
        except UngradableException:
            self.result["gradable"] = False
        finally:
            self.save_results()

    def tests(self):
        pass


class CPPGrader(CGrader):
    def __init__(self, compiler="g++"):
        super(CPPGrader, self).__init__(compiler)


if __name__ == "__main__":
    CGrader().start()
