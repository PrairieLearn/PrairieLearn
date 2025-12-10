# Python Autograder

This file documents the default Python autograder included in the `prairielearn/grader-python` Docker image. For general information on how to set up an external grader, view the [external grading](../externalGrading.md) documentation.

## Setting up

### `info.json`

The question should be first set up to enable [external grading](../externalGrading.md), with `"gradingMethod": "External"` set in the `info.json` settings. To use the specific Python autograder detailed in this document, `"image"` should be set to `"prairielearn/grader-python"` in the `"externalGradingOptions"` dictionary. The `entrypoint` property does not need to be provided.

A full `info.json` file should look something like:

```json title="info.json"
{
  "uuid": "...",
  "title": "...",
  "topic": "...",
  "tags": ["..."],
  "type": "v3",
  "singleVariant": true,
  "gradingMethod": "External",
  "externalGradingOptions": {
    "enabled": true,
    "image": "prairielearn/grader-python"
  }
}
```

### User variables

The question must specify the variables that will be read from student code for grading (`names_from_user`). Optionally, the question may also specify variables that will be made available to student code from the question's setup code (`names_for_user`). Only variables or functions listed in `names_for_user` will be accessible by the user from the setup code; only names listed in `names_from_user` will be accessible by the test cases from the user code.

Each variable must have the following:

- `name`: The name of the variable in the student code.
- `description`: A human-readable description of the variable.
- `type`: A human-readable description of the type of the variable. This is used for display purposes only, and does not affect the grading.

There are two ways to do specify these variables.

=== "`question.html`"

    The `<pl-external-grader-variables>` element can be used to both specify and display a table of variables.

    ```html title="question.html"
    <pl-external-grader-variables params-name="names_for_user">
      <pl-variable name="n" type="integer">
        Dimensionality of $\mathbf{A}$ and $\mathbf{b}$.
      </pl-variable>
      <pl-variable name="A" type="numpy array (shape $n \times n$)"> Matrix $\mathbf{A}$. </pl-variable>
      <pl-variable name="b" type="numpy array (length $n$)"> Vector $\mathbf{b}$. </pl-variable>
    </pl-external-grader-variables>

    <pl-external-grader-variables params-name="names_from_user">
      <pl-variable name="x" type="numpy array (length $n$)">
        Solution to $\mathbf{Ax}=\mathbf{b}$.
      </pl-variable>
    </pl-external-grader-variables>
    ```

=== "`server.py`"

    Using `<pl-external-grader-variables>` in `question.html` is the recommended way to specify user variables. However, if you need to dynamically generate the lists of variables or have more advanced needs, you can also do so directly in `server.py` by assigning to `data["params"]["names_for_user"]` and `data["params"]["names_from_user"]`. The following example is equivalent to the previous `question.html` example:

    ```python title="server.py"
    def generate(data):
        data["params"]["names_for_user"] = [
            {"name": "n", "description": r"Dimensionality of $\mathbf{A}$ and $\mathbf{b}$.", "type": "integer"},
            {"name": "A", "description": r"Matrix $\mathbf{A}$.", "type": "numpy array"},
            {"name": "b", "description": r"Vector $\mathbf{b}$.", "type": "numpy array"}
        ]
        data["params"]["names_from_user"] = [
            {"name": "x", "description": r"Solution to $\mathbf{Ax}=\mathbf{b}$.", "type": "numpy array"}
        ]
    ```

    You can still use `<pl-external-grader-variables>` to display the variables to students; just omit the nested `<pl-variable>` elements.

    ```html title="question.html"
    <pl-external-grader-variables params-name="names_for_user"></pl-external-grader-variables>
    <pl-external-grader-variables params-name="names_from_user"></pl-external-grader-variables>
    ```

### `question.html`

The question should contain a way for students to submit files, such as `<pl-file-editor>`, `<pl-file-upload>`, or a workspace. The question should also contain a `<pl-external-grader-results>` element to show the grading results. These are placed in the question panel and submission panel, respectively. It is also recommended to place a `<pl-file-preview>` element in the submission panel so that students may see their previous code submissions. An example question markup is given below:

```html title="question.html"
<pl-question-panel>
  <pl-file-editor file-name="user_code.py" ace-mode="ace/mode/python"></pl-file-editor>
</pl-question-panel>

<pl-submission-panel>
  <pl-external-grader-results></pl-external-grader-results>
  <pl-file-preview></pl-file-preview>
</pl-submission-panel>
```

By default, the grader will look for a gradable file named `user_code.py`, but this can be changed in the test suite.

Provided and/or expected variables can also be displayed to the user with the `<pl-external-grader-variables>` element. By setting the `params-name` attribute to either `names_for_user` or `names_from_user`, either set of variables can be shown.

### `tests/setup_code.py`

This file is executed before any reference or student code is run. Any variables defined in `names_for_user` can be accessed from here in student code, while the reference answer may freely access variables without restriction. The code in this file is run only _once_ total for both student and reference code. If you need to run some code before each of student and reference code (for example, to set a random seed), you may define the function `def repeated_setup()`, which will be executed before each of them. `repeated_setup()` will always run after the setup code itself is run.

The server parameters in `data` can be accessed with `data` in this file.

### `tests/test.py`

The test cases for each coding problem are defined as methods of a `Test` class contained in the `test.py` file. The class will extend from either `PLTestCase` or `PLTestCaseWithPlot`, depending on if you require plots from the student:

```python title="tests/test.py"
from pl_unit_test import PLTestCase, PLTestCaseWithPlot

# No plot grading
class Test(PLTestCase):
  pass

# Plot grading enabled
class Test(PLTestCaseWithPlot):
  pass
```

These classes themselves extend `unittest.TestCase`, so any functionality from there is also available.

Each test case is a separate method in the class, the names of these functions must be prefixed with `test_`, but any name that follows is arbitrary. Test cases are run in sorted order by the `unittest` library, so one convention that can be used is to give tests numeric names to ensure their running order.

Adding a name and point value to the test case is done by means of python decorators: `@points(val)` and `@name("name of the test case")`. These will control the name of the case shown to students and the points awarded. An example of a definition:

```python title="tests/test.py"
from pl_unit_test import PLTestCase
from pl_helpers import name, points

class Test(PLTestCase):
  @points(10)
  @name("Check basic math")
  def test_0(self):
    assert 1 == 1
```

Inside the test case implementation, the student answer variables and reference answer variables can be accessed as children of the tuples `self.st` and `self.ref`, respectively. There are various helper functions to check correctness of different types of variables, these are defined in `code_feedback.py`. These are taken from the RELATE grader, so this may be familiar to those with prior experience with RELATE.

At the end of the test case, set the correctness of the answer using `feedback.set_score()`. This function takes a floating point number between 0 and 1 (inclusive), with 0 being completely *in*correct and 1 being completely correct. By default, if no points are given the test case will be marked incorrect.

The overall structure of a test case should look something like:

```python title="tests/test.py"
from pl_unit_test import PLTestCase
from pl_helpers import name, points
from code_feedback import Feedback

class Test(PLTestCase):
  @points(10)
  @name("name of the test case")
  def test_0(self):
    if Feedback.check_scalar("name of the variable", self.ref.variable_name, self.st.variable_names):
        Feedback.set_score(1)
    else:
        Feedback.set_score(0)
```

Note that `Feedback.set_score()` is used to set the correctness of the test case between `0` and `1`, this is then multiplied by the number of points awarded by the test case. For example, if a test case is worth 10 points and `Feedback.set_score(0.5)` is run, the student will be awarded 5 points.

The server parameters in `data` can be accessed from within the test cases using `self.data`.

See the [code feedback documentation](#code-feedback) for a list of functions that can help you check the correctness of different types of variables.

### Leading and trailing code

If the optional files `tests/leading_code.py` and/or `tests/trailing_code.py` exist, the autograder will automatically prepend and append the contents to the user's submission before grading. This can be useful if alternative input methods are used, e.g. for Parson's problem questions to provide python imports or other code that must be run.

### Using `__name__ == "__main__"`

By default, the student's code does not execute with `__name__` set to `"__main__"`, as is usually the case with Python scripts that are executed as a Python script. This allows students to use code like the following to test and debug their code in their local environment without affecting the autograder functionality:

```python title="Student handout they are editing"
if __name__ == "__main__":
    # Student's own debugging code
```

If, on the other hand, a question expects a student to write code that checks for the value of `__name__`, this can be achieved by adding a [`tests/leading_code.py` file](#leading-and-trailing-code) with the following content:

```python title="tests/leading_code.py"
__name__ = "__main__"
```

### Multiple iterations

By setting the `total_iters` class variable, the test suite can be run for multiple iterations. To prevent a specific test case from being run multiple times, you can add the `@not_repeated` decorator to it.

### Code feedback

The code feedback library contains built-in functions for checking correctness of various datatypes. Here is a nonexhaustive list of them, for a more complete reference refer to the [autogenerated code docs](reference-docs.md) or the [source file on GitHub](https://github.com/PrairieLearn/PrairieLearn/blob/master/graders/python/python_autograder/code_feedback.py). Note that all functions will perform some sort of sanity checking on user input and will not fail if, for example, the student does not define an input variable.

- `check_numpy_array_features(name, ref, data)`
  Checks that a numpy array has the same shape and datatype as the reference solution. Does _not_ check values against the reference.
- `check_numpy_array_allclose(name, ref, data, rtol=1e-05, atol=1e-08)`
  Checks that a numpy array has the same shape and datatype as the reference solution, also checks values to see if they are close using specified `rtol` and `atol`.
- `check_list(name, ref, data, entry_type=None)`
  Checks that a list has the same length as the reference solution. If `entry_type` is not `None`, can optionally check if each element has that type. Does _not_ check values against the reference.
- `check_dict(name, ref, data, target_keys=None)`
  Checks that a student dict has all correct key-value mappings with respect to a reference dict.
- `check_tuple(name, ref, data)`
  Checks that a tuple has the same length and values as the reference solution.
- `check_scalar(name, ref, data, rtol=1e-5, atol=1e-8)`
  Checks that a scalar value is close to the reference solution using specified `rtol` and `atol`.
- `call_user(f, *args, **kwargs)`
  Calls a user defined function with specific `args` and `kwargs`.
- `check_dataframe(name, ref, data, subset_columns=None)`
  Checks that a Pandas DataFrame has the same contents as the reference solution. Can optionally check for a subset of columns by giving a list of column names to `subset_columns`.

Most of these functions have a `accuracy_critical` and `report_failure` keyword argument. If `accuracy_critical` is set to `True` (default is `False`), the grading job will halt if this check fails (similar to an assert). If `report_failure` is true (default), feedback will be displayed to the student if this check fails. The `name` argument is used when displaying feedback.

## General tips and gotchas

Note that the first argument of the `Feedback.check_xx` functions is the name of the variable being checked, this will show up in the grader feedback if the student answers this problem incorrectly.

Be careful not to switch the ordering of the student and reference arguments. The student answer is subject to more strict type checking, and there have been instances in the past where the grader has been broken by poorly formatted student answers.

## Disallowing library functions

**Note that because Python is a highly-dynamic language, the following method can be bypassed by students with sufficient knowledge of Python. For stronger guarantees about which functions are or are not used, consider using more advanced static analysis techniques, which are beyond the scope of what this autograder offers. You can also perform verification by hand with manual grading.**

One can hook into library functions in the setup code to disallow students from accessing certain functions. This example is taken from the [demo/autograder/python/numpy] question.

One can set library functions equal to `Feedback.not_allowed`:

```python
numpy.linalg.inv = Feedback.not_allowed
numpy.linalg.pinv = Feedback.not_allowed
```

Now, any time the student tries to use the functions, their code will raise an exception.

## Overview

```d2
direction: right
setup: "setup_code.py"
student: "Student Answer"
reference: "Reference Answer\n(ans.py)"
test: "Test Cases\n(test.py)"

setup -> student {
  label: "names_for_user"
  style: {
    bold: true
  }
}
setup -> reference {
  label: "All Variables"
  style: {
    bold: true
  }
}
student -> test {
  label: "names_from_user\n(self.st)"
  style: {
    bold: true
  }
}
reference -> test {
  label: "All Variables\n(self.ref)"
  style: {
    bold: true
  }
}
```

## Course-specific libraries

Some courses may use libraries that are common across multiple questions. For such questions, it is possible to save these libraries and classes in the course's `serverFilesCourse` directory. Any files in this directory are automatically added to the Python PATH, so they can be imported in any of the files above as needed. If this option is used, however, the question's `info.json` file should indicate that these files should be added to the grading container, as below:

```json title="info.json"
{
  "externalGradingOptions": {
    "enabled": true,
    "image": "prairielearn/grader-python",
    "serverFilesCourse": ["course_lib.py"]
  }
}
```

The process above is suitable for small utility libraries that are specific to a particular course. For larger libraries, including those installed from the [Python package index](https://pypi.org/) (i.e., via `pip install` or equivalent), you are strongly encouraged to [create your own custom grader image](../dockerImages.md#custom-variations-of-maintained-images), as that will provide better performance and improve student experience.

### Example usage of `serverFilesCourse` for static data

The Python autograder is able to retrieve information from `serverFilesCourse`. This can be used when there are files and other static data that can be shared across multiple questions. For example, assume there is a data file called `chem.json` used in multiple questions. The file can be saved in the `serverFilesCourse` directory within the course root directory, for example at `serverFilesCourse/compounds/chem.json`.

To access `serverFilesCourse` from the autograder, specify the file or its containing directory in the question `info.json`. For example, to copy the `compounds` directory to the autograder, use:

```json title="info.json" hl_lines="5"
{
  "externalGradingOptions": {
    "enabled": true,
    "image": "prairielearn/grader-python",
    "serverFilesCourse": ["compounds"]
  }
}
```

The tests in `test.py` can then load the `chem.json` file using code such as the following:

```python
import json

with open("/grade/serverFilesCourse/compounds/chem.json", "r") as f:
    list_of_compounds = json.load(f)
```

## Security

At the start of a grading job, the script `run.sh` is run with `root` privileges. This will initialise directories and copy grading files into the correct location, delete itself, and generate a secret filename for the grading results using `uuidgen` which is passed into the grading code via command-line argument. Then the actual grading script will then be run (`pltest.py`) as the user `ag`.

The grading Python scripts will load any sensitive files into memory (setup code, answer code, test cases) and remove them from disk before running any student code. Command line arguments in argv are wiped as well. Users therefore do not have access to question specific code, but only general grader logic which is publicly available.

After grading, results will be written to the secret filename generated above. If this file does not exist or the filename does not match then the grading job will fail and students will not receive points. This is mostly a failsafe in case the grader code were to crash, but in theory could also prevent crafty students from writing their own results file.

The grading job will now drop back to `root` in the `run.sh` script and will copy any output to the correct location, as expected by the external grading framework.

[demo/autograder/python/numpy]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/python/numpy
