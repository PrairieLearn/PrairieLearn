import contextlib
import json
import linecache
import os
import random
import sys
from copy import deepcopy
from os import path
from types import ModuleType
from typing import Any

import numpy as np
from faker import Faker
from pl_helpers import extract_ipynb_contents


class UserCodeFailedError(Exception):
    def __init__(self, err: Any, *args: Any) -> None:
        self.err = err
        super().__init__(err, *args)


def set_random_seed(seed: int | None = None) -> None:
    np.random.seed(seed)
    random.seed(seed)
    Faker.seed(seed)


def try_read(fname: str) -> str:
    try:
        with open(fname, encoding="utf-8") as f:
            contents = f.read()
    except Exception:
        contents = ""
    return contents


def populate_linecache(fname: str, contents: str) -> None:
    linecache.cache[fname] = (
        len(contents),
        None,
        [line + "\n" for line in contents.splitlines()],
        fname,
    )


def execute_code(
    fname_ref: str,
    fname_student: str,
    include_plt: bool = False,  # noqa: FBT001
    console_output_fname: str | None = None,
    test_iter_num: int = 0,
    ipynb_key: str = "#grade",
) -> tuple[dict[str, Any], dict[str, Any], ModuleType | None]:
    """
    execute_code(fname_ref, fname_student)

    Helper function for running user code.

    - fname_ref: Filename for the reference (answer) code.
    - fname_student: Filename for the submitted student answer code.
    - include_plt: If true, plots will be included in grading results.
    - console_output_fname: Filename to redirect console output to.
    - test_iter_num: The iteration number of this test, when test cases are run multiple times.

    Returns:
    - ref_result: A named tuple with reference variables
    - student_result: A named tuple with submitted student variables
    - plot_value: Any plots made by the student
    """

    filenames_dir = os.environ.get("FILENAMES_DIR")
    if filenames_dir is None:
        raise ValueError("FILENAMES_DIR not set in environment variables")

    with open(path.join(filenames_dir, "data.json"), encoding="utf-8") as f:
        data = json.load(f)
    with open(path.join(filenames_dir, "setup_code.py"), encoding="utf-8") as f:
        str_setup = f.read()
    with open(fname_ref, encoding="utf-8") as f:
        str_ref = f.read()

    # Read in leading, trailing code
    str_leading = try_read(path.join(filenames_dir, "leading_code.py"))
    str_trailing = try_read(path.join(filenames_dir, "trailing_code.py"))

    # Read student code (and transform if necessary) and append leading/trailing code
    with open(fname_student, encoding="utf-8") as f:
        _, extension = path.splitext(fname_student)
        if extension == ".ipynb":
            str_student = extract_ipynb_contents(f, ipynb_key)
            traceback_fname_student = f"{fname_student} #grade"
        else:
            str_student = f.read()
            traceback_fname_student = fname_student
    str_student = "\n".join(filter(bool, (str_leading, str_student, str_trailing)))

    with open(path.join(filenames_dir, "test.py"), encoding="utf-8") as f:
        str_test = f.read()

    # Delete sensitive code so students can't read e.g. test cases or setup code
    os.remove(path.join(filenames_dir, "data.json"))
    os.remove(fname_ref)
    os.remove(path.join(filenames_dir, "setup_code.py"))
    with contextlib.suppress(FileNotFoundError):
        os.remove(path.join(filenames_dir, "leading_code.py"))
    with contextlib.suppress(FileNotFoundError):
        os.remove(path.join(filenames_dir, "trailing_code.py"))
    os.remove(path.join(filenames_dir, "test.py"))

    # Since we've deleted some files, we need to manually populate
    # the linecache so that `traceback` can find the correct contents when
    # printing any exceptions.
    populate_linecache(path.join(filenames_dir, "setup_code.py"), str_setup)
    populate_linecache(fname_ref, str_ref)

    # Seed student code and answer code with same seed
    seed = random.randint(0, (2**32) - 1)

    setup_globals = {"test_iter_num": test_iter_num, "data": data}
    # make all the variables in setup_code.py available to ans.py
    code_setup = compile(str_setup, path.join(filenames_dir, "setup_code.py"), "exec")
    exec(code_setup, setup_globals)

    # If the setup code has a repeated_setup function, run it.
    repeated_setup = setup_globals.get("repeated_setup")
    if repeated_setup is not None and callable(repeated_setup):
        repeated_setup()

    names_for_user = [v["name"] for v in data["params"].get("names_for_user", [])]

    # Make copies of variables that go to the user so we do not clobber them
    ref_code = {}
    for i, j in setup_globals.items():
        if (not (i == "__builtins__" or isinstance(j, ModuleType))) and (
            i in names_for_user
        ):
            ref_code[i] = j  # noqa: PERF403 (too complex)
    ref_code = deepcopy(ref_code)

    # Add any other variables to reference namespace and do not copy
    for i, j in setup_globals.items():
        if not (
            i == "__builtins__" or isinstance(j, ModuleType) or i in names_for_user
        ):
            ref_code[i] = j
    set_random_seed(seed)
    code_ref = compile(str_ref, fname_ref, "exec")
    exec(code_ref, ref_code)
    # ref_code contains the correct answers

    if include_plt:
        for j in ref_code.values():
            if (
                isinstance(j, ModuleType)
                and j.__dict__["__name__"] == "matplotlib.pyplot"
            ):
                j.close("all")

    # make only the variables listed in names_for_user available to student
    names_from_user = [
        variable["name"] for variable in data["params"]["names_from_user"]
    ]

    # If the setup code has a repeated_setup function, run it.
    repeated_setup = setup_globals.get("repeated_setup")
    if repeated_setup is not None and callable(repeated_setup):
        repeated_setup()

    # Remove the setup and answer code from the linecache to make it slightly
    # harder for students to read it.
    linecache.cache.pop(path.join(filenames_dir, "setup_code.py"), None)
    linecache.cache.pop(fname_ref, None)

    student_globals = {}
    for i, j in setup_globals.items():
        if (not (i == "__builtins__" or isinstance(j, ModuleType))) and (
            i in names_for_user
        ):
            student_globals[i] = j  # noqa: PERF403 (too complex)
    student_globals = deepcopy(student_globals)

    # Execute student code
    previous_stdout = sys.stdout
    if console_output_fname:
        sys.stdout = open(console_output_fname, "w", encoding="utf-8")  # noqa: SIM115

    set_random_seed(seed)

    # The file at path `fname_student` doesn't actually correspond to the
    # code that we're going to execute, since it doesn't include the leading
    # and trailing code. We'll manually construct a `linecache` entry for it
    # so that the traceback will show the correct code for each line. For
    # notebooks, this name does not match a real file, so that students see
    # a pointer to the original source of the code in the traceback.
    populate_linecache(traceback_fname_student, str_student)

    try:
        code_student = compile(str_student, traceback_fname_student, "exec")
        exec(code_student, student_globals)
        err = None
    except Exception:
        err = sys.exc_info()

    # Now that user code has been run, replace deleted files in case we are to run the tests again.
    with open(path.join(filenames_dir, "data.json"), "w", encoding="utf-8") as f:
        json.dump(data, f)
    with open(fname_ref, "w", encoding="utf-8") as f:
        f.write(str_ref)
    with open(path.join(filenames_dir, "setup_code.py"), "w", encoding="utf-8") as f:
        f.write(str_setup)
    if len(str_leading) > 0:
        with open(
            path.join(filenames_dir, "leading_code.py"), "w", encoding="utf-8"
        ) as f:
            f.write(str_leading)
    if len(str_trailing) > 0:
        with open(
            path.join(filenames_dir, "trailing_code.py"), "w", encoding="utf-8"
        ) as f:
            f.write(str_trailing)
    with open(path.join(filenames_dir, "test.py"), "w", encoding="utf-8") as f:
        f.write(str_test)
    if err is not None:
        raise UserCodeFailedError(err)

    # Redirect stdout back to normal
    sys.stdout.flush()
    sys.stdout = previous_stdout

    ref_result = {}
    for i, j in ref_code.items():
        if not (i.startswith("_") or isinstance(j, ModuleType)):
            ref_result[i] = j  # noqa: PERF403 (too complex)

    student_result = {}
    for name in names_from_user:
        student_result[name] = student_globals.get(name, None)

    plot_value = None
    if include_plt:
        for val in student_globals.values():
            if (
                isinstance(val, ModuleType)
                and val.__dict__["__name__"] == "matplotlib.pyplot"
            ):
                plot_value = val

        if not plot_value:
            import matplotlib as mpl
            import matplotlib.pyplot as plt

            mpl.use("Agg")

            plot_value = plt

    # Re-seed before running tests
    set_random_seed()
    return ref_result, student_result, plot_value
