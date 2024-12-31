import contextlib
import json
import os
import random
import sys
from copy import deepcopy
from pathlib import Path
from types import ModuleType

import numpy as np
import pl_helpers
from faker import Faker


class UserCodeFailedError(Exception):
    def __init__(self, err, *args):
        self.err = err
        super().__init__(err, *args)


def set_random_seed(seed=None):
    np.random.seed(seed)
    random.seed(seed)
    Faker.seed(seed)


def try_read(fname):
    try:
        with open(fname, encoding="utf-8") as f:
            contents = f.read()
    except FileNotFoundError:
        contents = ""
    return contents


def execute_code(
    fname_ref,
    fname_student,
    include_plt=False,
    console_output_fname=None,
    test_iter_num=0,
    ipynb_key="#grade",
):
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
    data_json_path = Path(filenames_dir) / "data.json"
    setup_code_path = Path(filenames_dir) / "setup_code.py"
    leading_code_path = Path(filenames_dir) / "leading_code.py"
    trailing_code_path = Path(filenames_dir) / "trailing_code.py"
    test_code_path = Path(filenames_dir) / "test.py"

    with open(data_json_path, encoding="utf-8") as f:
        data = json.load(f)
    with open(setup_code_path, encoding="utf-8") as f:
        str_setup = f.read()
    with open(fname_ref, encoding="utf-8") as f:
        str_ref = f.read()

    # Read in leading, trailing code
    str_leading = try_read(leading_code_path)
    str_trailing = try_read(trailing_code_path)

    # Read student code (and transform if necessary) and append leading/trailing code
    fname_student_path = Path(fname_student)
    with open(fname_student_path, encoding="utf-8") as f:
        if fname_student_path.suffix == ".ipynb":
            str_student = pl_helpers.extract_ipynb_contents(f, ipynb_key)
        else:
            str_student = f.read()
    str_student = str_leading + str_student + str_trailing

    with open(test_code_path, encoding="utf-8") as f:
        str_test = f.read()

    # Delete sensitive code so students can't read e.g. test cases or setup code
    data_json_path.unlink()
    fname_ref.unlink()
    setup_code_path.unlink()
    with contextlib.suppress(FileNotFoundError):
        leading_code_path.unlink()
    with contextlib.suppress(FileNotFoundError):
        trailing_code_path.unlink()
    test_code_path.unlink()

    repeated_setup_name = "repeated_setup()"
    if repeated_setup_name not in str_setup:
        repeated_setup_name = "pass"

    # Seed student code and answer code with same seed
    seed = random.randint(0, (2**32) - 1)

    setup_code = {"test_iter_num": test_iter_num, "data": data}
    # make all the variables in setup_code.py available to ans.py
    exec(str_setup, setup_code)
    exec(repeated_setup_name, setup_code)

    names_for_user = []
    for variable in data["params"]["names_for_user"]:
        names_for_user.append(variable["name"])

    # Make copies of variables that go to the user so we do not clobber them
    ref_code = {}
    for i, j in setup_code.items():
        if (not (i == "__builtins__" or isinstance(j, ModuleType))) and (
            i in names_for_user
        ):
            ref_code[i] = j
    ref_code = deepcopy(ref_code)

    # Add any other variables to reference namespace and do not copy
    for i, j in setup_code.items():
        if not (
            i == "__builtins__" or isinstance(j, ModuleType) or i in names_for_user
        ):
            ref_code[i] = j
    set_random_seed(seed)
    exec(str_ref, ref_code)
    # ref_code contains the correct answers

    if include_plt:
        for _, j in ref_code.items():
            if (
                isinstance(j, ModuleType)
                and j.__dict__["__name__"] == "matplotlib.pyplot"
            ):
                j.close("all")

    # make only the variables listed in names_for_user available to student
    names_from_user = []
    for variable in data["params"]["names_from_user"]:
        names_from_user.append(variable["name"])

    exec(repeated_setup_name, setup_code)

    student_code = {}
    for i, j in setup_code.items():
        if (not (i == "__builtins__" or isinstance(j, ModuleType))) and (
            i in names_for_user
        ):
            student_code[i] = j
    student_code = deepcopy(student_code)

    # Execute student code
    previous_stdout = sys.stdout
    if console_output_fname:
        sys.stdout = open(console_output_fname, "w", encoding="utf-8")  # noqa: SIM115

    set_random_seed(seed)

    try:
        exec(str_student, student_code)
        err = None
    except Exception:  # noqa: BLE001
        err = sys.exc_info()

    # Now that user code has been run, replace deleted files in case we are to run the tests again.
    with open(data_json_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    with open(fname_ref, "w", encoding="utf-8") as f:
        f.write(str_ref)
    with open(setup_code_path, "w", encoding="utf-8") as f:
        f.write(str_setup)
    if len(str_leading) > 0:
        with open(leading_code_path, "w", encoding="utf-8") as f:
            f.write(str_leading)
    if len(str_trailing) > 0:
        with open(trailing_code_path, "w", encoding="utf-8") as f:
            f.write(str_trailing)
    with open(test_code_path, "w", encoding="utf-8") as f:
        f.write(str_test)
    if err is not None:
        raise UserCodeFailedError(err)

    # Redirect stdout back to normal
    sys.stdout.flush()
    sys.stdout = previous_stdout

    ref_result = {}
    for i, j in ref_code.items():
        if not (i.startswith("_") or isinstance(j, ModuleType)):
            ref_result[i] = j

    student_result = {}
    for name in names_from_user:
        student_result[name] = student_code.get(name, None)

    plot_value = None
    if include_plt:
        for key in list(student_code):
            if (
                isinstance(student_code[key], ModuleType)
                and student_code[key].__dict__["__name__"] == "matplotlib.pyplot"
            ):
                plot_value = student_code[key]
        if not plot_value:
            import matplotlib as mpl

            mpl.use("Agg")
            import matplotlib.pyplot as plt

            plot_value = plt

    # Re-seed before running tests
    set_random_seed()
    return ref_result, student_result, plot_value
