#! /usr/bin/python3

import json
import os
import pathlib
import re
import shlex
import subprocess
import tempfile
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any, Literal, TypedDict, TypeGuard

import lxml.etree as et

CODEBASE = "/grade/student"
DATAFILE = "/grade/data/data.json"
SB_USER = "sbuser"

# List of symbols that are not allowed to be used in student code
INVALID_SYMBOLS = frozenset((
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
))
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


class UngradableError(Exception):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


# This is a deprecated alias for UngradableError, kept for backwards compatibility in existing question code.
# It should no longer be used in any new code.
UngradableException = UngradableError


@dataclass
class _Catch2Expression:
    success: bool
    type: str
    filename: str
    line: int
    original: str
    expanded: str
    formatted: str


@dataclass
class _Catch2TestCase:
    """
    A dataclass representing a single test case in a Catch2 test suite.
    """

    name: str
    """The name of the test case."""
    points: float
    """The number of points associated with the test case."""
    success: bool
    """Whether the test case passed or failed."""
    stdout: str
    """The standard output of the test case."""
    tags: list[str]
    """A list of tags associated with the test case."""
    filename: str
    """The filename of the test case."""
    line: int
    """The line number of the test case."""
    expression: _Catch2Expression | None


@dataclass
class _Catch2TestGroup:
    """
    A dataclass representing a group of test cases in a Catch2 test suite.
    """

    name: str
    """The name of the test group."""
    test_cases: list[_Catch2TestCase]
    """A list of test cases in the group."""


def is_str_list(val: list[float | str | int]) -> TypeGuard[list[str]]:
    """Determines whether all objects in the list are strings"""
    return all(isinstance(x, str) for x in val)


# TODO: in version 3.11 we can use `Required` to mark properties as such.
class TestResult(TypedDict, total=False):
    name: str
    description: str
    points: float
    max_points: float
    output: str
    message: str
    images: list[dict[str, str] | str]


class CGrader:
    def __init__(self, compiler: str = "gcc") -> None:
        with open(DATAFILE) as file:
            self.data = json.load(file)
        self.compiler = compiler

    def run_command(
        self,
        command: str | list[str],
        input: Any | None = None,  # noqa: A002
        sandboxed: bool = True,  # noqa: FBT001
        timeout: float | None = None,
        env: dict[str, str] | None = None,
    ) -> str:
        if isinstance(command, str):
            command = shlex.split(command)
        try:
            if env is None:
                env = {}
            proc = subprocess.Popen(
                command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env={**os.environ, **({"PATH": self.path} if sandboxed else {}), **env},
                user=SB_USER if sandboxed else None,
            )
        except Exception:
            return ""
        out = ""
        tostr = ""
        if isinstance(input, bytearray):
            input = bytes(input)  # noqa: A001
        if input is not None and not isinstance(input, bytes):
            input = str(input).encode("utf-8")  # noqa: A001
        try:
            proc.communicate(input=input, timeout=timeout)[0]
        except subprocess.TimeoutExpired:
            tostr = TIMEOUT_MESSAGE
        finally:
            proc.kill()
            try:
                out = proc.communicate(timeout=timeout)[0].decode(
                    "utf-8", "backslashreplace"
                )
            except subprocess.TimeoutExpired:
                tostr = TIMEOUT_MESSAGE

        return out + tostr

    def compile_file(
        self,
        c_file: Iterable[str] | str,
        exec_file: str | None = None,
        add_c_file: str | Iterable[str] | None = None,
        compiler: str | None = None,
        flags: str | list[str] | None = None,
        pkg_config_flags: str | Iterable[str] | None = None,
        add_warning_result_msg: bool = True,  # noqa: FBT001
        ungradable_if_failed: bool = True,  # noqa: FBT001
        return_objects: bool = False,  # noqa: FBT001
        enable_asan: bool = False,  # noqa: FBT001
        reject_symbols: Iterable[str] | None = None,
        objcopy_args: Iterable[str] | None = None,
    ) -> tuple[str, list[str]] | str:
        cflags = flags
        if cflags and isinstance(cflags, str):
            cflags = shlex.split(cflags)
        elif not cflags:
            cflags = []
        if enable_asan:
            cflags.extend(ASAN_FLAGS)

        if not add_c_file:
            add_c_file = []
        elif isinstance(add_c_file, str):
            add_c_file = [add_c_file]

        if not compiler:
            compiler = self.compiler

        if pkg_config_flags:
            if isinstance(pkg_config_flags, str):
                pkg_config_flags = shlex.split(pkg_config_flags)
            out_flags = self.run_command(["pkg-config", "--cflags", *pkg_config_flags])
            if out_flags:
                cflags.extend(shlex.split(out_flags))

        out = ""
        std_obj_files: list[str] = []
        objs: list[str] = []
        for std_c_file in [c_file] if isinstance(c_file, str) else c_file:
            obj_file = pathlib.Path(std_c_file).with_suffix(".o").absolute().as_posix()
            std_obj_files.append(obj_file)
            out += self.run_command(
                [compiler, "-save-temps", "-c", std_c_file, "-o", obj_file, *cflags],
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
                    with open(preprocessed_file) as f:
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
                        ["objcopy", obj_file, *objcopy_args], sandboxed=False
                    )

        if all(os.path.isfile(obj) for obj in std_obj_files):
            # Add new C files that maybe overwrite some existing functions.
            for added_c_file in add_c_file:
                obj_file = (
                    pathlib.Path(added_c_file).with_suffix(".o").absolute().as_posix()
                )
                out += self.run_command(
                    [compiler, "-c", added_c_file, "-o", obj_file, *cflags],
                    sandboxed=False,
                )
                objs.append(obj_file)

        if ungradable_if_failed and not all(
            os.path.isfile(f) for f in objs + std_obj_files
        ):
            self.result["message"] += (
                f"Compilation errors, please fix and try again.\n\n{out}\n"
            )
            raise UngradableError("Compilation errors")
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
        student_obj_files: str | Iterable[str] | None,
        add_obj_files: str | Iterable[str] | None,
        exec_file: str,
        compiler: str | None = None,
        flags: str | list[str] | None = None,
        pkg_config_flags: str | Iterable[str] | None = None,
        add_warning_result_msg: bool = True,  # noqa: FBT001
        ungradable_if_failed: bool = True,  # noqa: FBT001
        enable_asan: bool = False,  # noqa: FBT001
    ) -> str:
        if flags and isinstance(flags, str):
            flags = shlex.split(flags)
        elif not flags:
            flags = []
        if enable_asan:
            flags.extend(ASAN_FLAGS)

        if not student_obj_files:
            student_obj_files = []
        elif isinstance(student_obj_files, str):
            student_obj_files = [student_obj_files]

        if not add_obj_files:
            add_obj_files = []
        elif isinstance(add_obj_files, str):
            add_obj_files = [add_obj_files]
        if add_obj_files:
            flags.append("-Wl,--allow-multiple-definition")

        if not compiler:
            compiler = self.compiler

        if pkg_config_flags:
            if isinstance(pkg_config_flags, str):
                pkg_config_flags = shlex.split(pkg_config_flags)
            out_flags = self.run_command(["pkg-config", "--libs", *pkg_config_flags])
            if out_flags:
                flags.extend(shlex.split(out_flags))

        # The student C files must be the last so its functions can be overwritten
        out = self.run_command(
            [
                compiler,
                *add_obj_files,
                *student_obj_files,
                "-o",
                exec_file,
                "-lm",
                *flags,
            ],
            sandboxed=False,
        )

        if os.path.isfile(exec_file):
            self.change_mode(exec_file, "755")
        elif ungradable_if_failed:
            self.result["message"] += (
                f"Linker errors, please fix and try again.\n\n{out}\n"
            )
            raise UngradableError("Linker errors")
        if out and add_warning_result_msg:
            self.result["message"] += f"Linker warnings:\n\n{out}\n"
        return out

    def test_compile_file(
        self,
        c_file: str | Iterable[str],
        exec_file: str | None = None,
        main_file: str | None = None,
        add_c_file: str | list[str] | None = None,
        compiler: str | None = None,
        points: float = 1,
        field: str | None = None,
        flags: str | list[str] | None = None,
        pkg_config_flags: str | Iterable[str] | None = None,
        name: str = "Compilation",
        add_warning_result_msg: bool = True,  # noqa: FBT001
        ungradable_if_failed: bool = True,  # noqa: FBT001
        enable_asan: bool = False,  # noqa: FBT001
        reject_symbols: Iterable[str] | None = None,
        objcopy_args: Iterable[str] | None = None,
    ) -> TestResult:
        if not add_c_file:
            add_c_file = []
        elif isinstance(add_c_file, str):
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

    def change_mode(
        self,
        file: str,
        mode: str = "744",
        change_parent: bool = True,  # noqa: FBT001
    ) -> None:
        file = os.path.abspath(file)
        self.run_command(["chmod", mode, file], sandboxed=False)
        parent = os.path.dirname(file)
        # Ensure that all users can resolve the path name
        if change_parent and parent and not os.path.samefile(file, parent):
            self.change_mode(parent, "a+x")

    def test_send_in_check_out(self, *args: Any, **kwargs: Any) -> TestResult:
        """Old deprecated function name,
        retained for compatibility reasons."""
        return self.test_run(*args, **kwargs)

    def test_run(
        self,
        command: str | Iterable[str],
        input: str | None = None,  # noqa: A002
        exp_output: str | Iterable[str] | None = None,
        must_match_all_outputs: OutputMatchingOption | bool = "any",  # noqa: FBT001
        reject_output: str | Iterable[str] | None = None,
        field: str | None = None,
        ignore_case: bool = True,  # noqa: FBT001
        timeout: float = 1,
        size_limit: int = 10240,
        ignore_consec_spaces: bool = True,  # noqa: FBT001
        args: str | float | Iterable[str | float | int] | None = None,
        name: str | None = None,
        msg: str | None = None,
        max_points: float = 1,
        highlight_matches: bool = False,  # noqa: FBT001
    ) -> TestResult:
        if args is not None:
            if isinstance(args, str | float | int):
                args = [args]
            args = list(map(str, args))
            assert is_str_list(args)

        if name is None and input is not None:
            name = 'Test with input "{}"'.format(" ".join(input.splitlines()))
        elif name is None and args is not None:
            name = 'Test with arguments "{}"'.format(" ".join(args))
        elif name is None and not isinstance(command, str):
            name = f"Test command: {next(iter(command))}"
        elif name is None:
            name = f"Test command: {command}"

        if exp_output is None:
            exp_output = []
            must_match_all_outputs = True
        elif isinstance(exp_output, str):
            exp_output = [exp_output]

        if reject_output is None:
            reject_output = []
        elif isinstance(reject_output, str):
            reject_output = [reject_output]

        if must_match_all_outputs is True:
            must_match_all_outputs = "all"
        elif must_match_all_outputs is False:
            must_match_all_outputs = "any"

        def compile_re(t: str | re.Pattern[str] | Any) -> tuple[str, re.Pattern[str]]:
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
                    re.IGNORECASE if ignore_case else 0,
                ),
            )

        exp_output_with_regex = [compile_re(t) for t in exp_output]
        reject_output_with_regex = [compile_re(t) for t in reject_output]
        command = shlex.split(command) if isinstance(command, str) else list(command)

        out = self.run_command(
            command if args is None else command + args,
            input,
            sandboxed=True,
            timeout=timeout,
        )

        outcmp = out
        if highlight_matches and out:
            for _, r in exp_output_with_regex:
                out = r.sub(r"\033[32m\g<0>\033[0m", out)
            for _, r in reject_output_with_regex:
                out = r.sub(r"\033[31m\g<0>\033[0m", out)
        if not out:
            out = "(NO OUTPUT)"
        elif not out.endswith("\n"):
            out += "\n(NO ENDING LINE BREAK)"

        if msg is None and exp_output_with_regex:
            quantifier = ""
            if len(exp_output_with_regex) > 1:
                quantifier = " one of" if must_match_all_outputs == "any" else " all of"
            join_str = (
                "\n\n" if any("\n" in t for t, _ in exp_output_with_regex) else "\n\t"
            )
            msg = f"Expected{quantifier}:{join_str}" + join_str.join(
                (
                    f"\033[32m{t}\033[0m"
                    if highlight_matches and r.search(outcmp) is not None
                    else t
                )
                for t, r in exp_output_with_regex
            )
            if reject_output_with_regex:
                join_str = (
                    "\n\n"
                    if any("\n" in t for t, _ in reject_output_with_regex)
                    else "\n\t"
                )
                msg += f"\nBut not:{join_str}" + join_str.join(
                    (
                        f"\033[31m{t}\033[0m"
                        if highlight_matches and r.search(outcmp) is not None
                        else t
                    )
                    for t, r in reject_output_with_regex
                )
        elif msg is None:
            msg = ""

        points = max_points
        if timeout and "TIMEOUT" in outcmp:
            points = 0
        elif size_limit and len(outcmp) > size_limit:
            out = out[0:size_limit] + "\nTRUNCATED: Output too long."
            points = 0
        elif any(r.search(outcmp) is not None for _, r in reject_output_with_regex):
            points = 0
        elif must_match_all_outputs == "partial":
            points = (
                max_points
                * sum(
                    1 if r.search(outcmp) is not None else 0
                    for _, r in exp_output_with_regex
                )
                / len(exp_output_with_regex)
            )
        elif not (all if must_match_all_outputs == "all" else any)(
            r.search(outcmp) is not None for _, r in exp_output_with_regex
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

    def add_manual_grading(
        self,
        points: float = 1,
        name: str | None = None,
        description: str | None = None,
    ) -> TestResult:
        """Old deprecated function, retained for compatibility reasons."""
        if not name:
            name = "Manual Grading - to be reviewed by a human grader"
        if not description:
            description = "This code will be manually reviewed by a human grader. The points associated to this component will be added based on evaluation of code style, programming practices and other manully checked criteria."
        return self.add_test_result(name, description, points=0, max_points=points)

    def add_test_result(
        self,
        name: str,
        description: str = "",
        points: bool | float = True,  # noqa: FBT001
        msg: str | None = "",
        output: str = "",
        max_points: float = 1,
        field: str | None = None,
        images: str | dict[str, str] | list[str | dict[str, str]] | None = None,
    ) -> TestResult:
        if isinstance(points, bool):
            points = max_points if points else 0.0

        test: TestResult = {
            "name": name,
            "description": description,
            "points": points,
            "max_points": max_points,
            "output": output,
            "message": msg or "",
        }
        if images and isinstance(images, str | dict):
            test["images"] = [images]
        elif images:
            test["images"] = list(images)

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
        exec_file: str,
        args: str | Iterable[str] | None = None,
        use_suite_title: bool = False,  # noqa: FBT001
        use_case_name: bool = True,  # noqa: FBT001
        use_unit_test_id: bool = True,  # noqa: FBT001
        use_iteration: bool = False,  # noqa: FBT001
        sandboxed: bool = False,  # noqa: FBT001
        use_malloc_debug: bool = False,  # noqa: FBT001
        env: dict[str, str] | None = None,
    ) -> None:
        if not args:
            args = []
        if isinstance(args, str):
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

        out = self.run_command([exec_file, *args], env=env, sandboxed=sandboxed)

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
            with open(log_file, errors="backslashreplace") as log:
                tree = et.parse(log, parser=et.XMLParser())
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
                        output=test.findtext("{*}message") or "",
                    )
        except FileNotFoundError as exc:
            self.result["message"] += (
                "Test suite log file not found. Consult the instructor.\n"
            )
            raise UngradableError("Test suite log file not found.") from exc
        except et.ParseError as exc:
            self.result["message"] += f"Error parsing test suite log.\n\n{exc}\n"
            raise UngradableError("Error parsing test suite log.") from exc

    def save_results(self) -> None:
        if self.result["max_points"] > 0:
            self.result["score"] = self.result["points"] / self.result["max_points"]
        if "partial_scores" in self.result:
            for ps in self.result["partial_scores"].values():
                ps["score"] = ps["points"] / ps["max_points"]

        if not os.path.exists("/grade/results"):
            os.makedirs("/grade/results")
        with open("/grade/results/results.json", "w") as resfile:
            json.dump(self.result, resfile)

    def start(self) -> None:
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
        except UngradableError:
            self.result["gradable"] = False
        finally:
            self.save_results()

    def tests(self) -> None:
        pass


class CPPGrader(CGrader):
    def __init__(self, compiler: str = "g++") -> None:
        super().__init__(compiler)

    def _parse_catch2_tags(
        self, tags: list[str], test_name: str
    ) -> tuple[float, list[str]]:
        """Parse Catch2 tags to extract points and string tags."""
        points = 1
        str_tags = []
        found = False
        for tag in tags:
            try:
                points = float(tag)
                if points <= 0:
                    raise UngradableError(
                        f"Points must be positive (found point value '{points}') in test case '{test_name}'"
                    )
                if found:
                    raise UngradableError(
                        f"Multiple numeric tags found in test case '{test_name}'"
                    )
                found = True
            except ValueError:  # noqa: PERF203
                str_tags.append(tag)
        return points, str_tags

    def run_catch2_suite(
        self,
        exec_file: str,
        args: Iterable[str] = [],
        name_formatter: Callable[[_Catch2TestCase, _Catch2TestGroup], str]
        | None = None,
        description_formatter: Callable[[_Catch2TestCase, _Catch2TestGroup], str]
        | None = None,
    ) -> None:
        """
        Runs a file compiled with [catch2](https://github.com/catchorg/Catch2) v3 and parses the results.

        Uses the catch2 XML output format to parse the results. Points should be specified using a tag, and will otherwise default to one point

        For example,

        ```
        TEST_CASE("My Test case", "[1.5]") {
            ...
        }
        ```

        Parameters:
            exec_file: The path to the test suite executable, compiled with catch2.
            args: Additional arguments to pass to the test suite executable.
            name_formatter: A function that takes a test case and a test group and returns the name of the test case.
            description_formatter: A function that takes a test case and a test group and returns the description of the test case.
        """
        if not os.path.isfile(exec_file):
            raise UngradableError(f"Test suite executable not found: {exec_file}")

        out = self.run_command([exec_file, "-r", "xml", *args], sandboxed=True)
        try:
            tree = et.fromstring(out.encode("utf-8"), parser=et.XMLParser())
        except et.XMLSyntaxError as exc:
            raise UngradableError("Error parsing test suite output") from exc

        def default_name_formatter(
            test_case: _Catch2TestCase, test_group: _Catch2TestGroup
        ) -> str:
            return f"[{test_group.name}] {test_case.name} [{', '.join(test_case.tags)}]"

        def default_description_formatter(
            test_case: _Catch2TestCase, _test_group: _Catch2TestGroup
        ) -> str:
            output = ""
            if test_case.expression:
                output += f"{test_case.expression.formatted}\n"
            if test_case.stdout:
                output += f"stdout:\n{test_case.stdout}"
            return output

        if name_formatter is None:
            name_formatter = default_name_formatter

        if description_formatter is None:
            description_formatter = default_description_formatter

        test_groups = []
        for group in tree.findall(".//Group"):
            name = group.get("name")
            test_cases = []
            for test in group.findall(".//TestCase"):
                name = test.attrib.get("name", "")
                raw_tags = test.attrib.get("tags", "")
                filename = test.attrib.get("filename", "")
                line = int(test.attrib.get("line", -1))

                tags = re.findall(r"\[(.*?)\]", raw_tags)
                points, str_tags = self._parse_catch2_tags(tags, name)
                result = test.find(".//OverallResult")
                if result is None:
                    raise UngradableError(
                        f"Missing 'OverallResult' element in test case '{name}'"
                    )

                success = result.attrib.get("success") == "true"

                stdout_elem = result.find(".//StdOut")
                stdout = stdout_elem.text if stdout_elem is not None else ""

                expression_el = test.find(".//Expression")
                expression = None
                if expression_el is not None:
                    original = expression_el.find(".//Original")
                    expanded = expression_el.find(".//Expanded")
                    original_text = original.text if original is not None else ""
                    expanded_text = expanded.text if expanded is not None else ""
                    expression_success = expression_el.attrib.get("success") == "true"
                    expression_type = expression_el.attrib.get("type", "")
                    expression_filename = expression_el.attrib.get("filename", "")
                    expression_line = int(expression_el.attrib.get("line", -1))
                    success_str = "PASSED" if expression_success else "FAILED"
                    # This is a similar style to the Catch2 output
                    formatted_expression = (
                        f"{expression_filename}:{expression_line}: {success_str}:\n"
                        + f'\t{expression_type}( "{original_text}" )\n'
                        + "with expansion:\n"
                        + f"\t{expanded_text}"
                    )
                    expression = _Catch2Expression(
                        expression_success,
                        expression_type,
                        expression_filename,
                        expression_line,
                        original_text,
                        expanded_text,
                        formatted_expression,
                    )

                test_cases.append(
                    _Catch2TestCase(
                        name,
                        points,
                        success,
                        stdout,
                        str_tags,
                        filename,
                        line,
                        expression,
                    )
                )
            test_groups.append(_Catch2TestGroup(name, test_cases))

        for test_group in test_groups:
            for test_case in test_group.test_cases:
                self.add_test_result(
                    name=name_formatter(test_case, test_group),
                    description=description_formatter(test_case, test_group),
                    points=test_case.points if test_case.success else 0,
                    max_points=test_case.points,
                    output=test_case.stdout,
                )


if __name__ == "__main__":
    CGrader().start()
