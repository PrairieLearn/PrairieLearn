# Python Autograder

This file documents the default Python autograder included in the `prairielearn/grader-python` Docker image.  For general information on how to set up an external grader, visit the [external grading](../externalGrading.md) page. 

## Setting up

### `info.json`

The question should be first set up to enable [external grading](../externalGrading.md), with `"gradingMethod": "External"` set in the `info.json` settings.  To use the specific Python autograder detailed in this document, `"image"` should be set to `"prairielearn/grader-python"` and `"entrypoint"` should point to `"/python_autograder/run.sh"` in the `"externalGradingOptions"` dictionary.

A full `info.json` file should look something like:

```javascript
{
    "uuid": "...",
    "title": "...",
    "topic": "...",
    "tags": [...],
    "type": "v3",
    "singleVariant": true,
    "gradingMethod": "External",
    "externalGradingOptions": {
        "enabled": true,
        "image": "prairielearn/grader-python",
        "entrypoint": "/python_autograder/run.sh",
    }
}
```

### `server.py`

The server code in the `generate()` function will define the list of variables that will be passed to the autograded student code `names_for_user`, and also those that will be passed from the student code to the test code `names_from_user`.  Only variables listed in `names_for_user` will be accessible by the user from the setup code; only variables listed in `names_from_user` will be accessible by the test cases from the user code.

These are stored as a list of dictionary objects in the `data["params"]` dict.  The above `names_for_user` and `names_from_user` lists are stored as a separate key in `params`. Each variable dictionary has the following format:

```json
{
    "name": "(name of the variable)",
    "description": "(Human readable description of the variable)",
    "type": "(Human readable type of the variable)"
}
```

A full example is included here, taken from the question `demoAutograderSquare`:

```python
def generate(data):
    names_for_user = [
        {"name": "x", "description": "Description of the variable", "type": "float"}
    ]
    names_from_user = [
        {"name": "x_sq",
            "description": "The square of $x$", "type": "float"}
    ]

    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user

    return data
```

### `question.html`

At a minimum, the question markup should contain a `pl-file-editor` element (or `pl-file-upload`) and a `pl-external-grading-results` to show the status of grading jobs.  These are placed in the question panel and submission panel, respectively, and thus the question markup should be structured as:

```html
<pl-question-panel>
	<pl-file-editor file-name="user_code.py"></pl-file-editor>
</pl-question-panel>

<pl-submission-panel>
	<pl-external-grading-results></pl-external-grading-results>
</pl-submission-panel>
```

By default, the grader will look for a gradable file named `user_code.py`, but this can be changed in the test suite.

Expected variables can also be displayed to the user with the `<pl-external-grader-variables>` element.  By setting the `variables-name` attribute to either `names_for_user` or `names_from_user`, both sets of variables can be shown.

Full example:

```html
<pl-question-panel>
  <p> ... Question prompt ... </p>

  <p>The setup code gives the following variables:</p>
  <p><pl-external-grader-variables variables-category="names_for_user"></pl-external-grader-variables></p>

  <p>Your code snippet should define the following variables:</p>
  <pl-external-grader-variables variables-category="names_from_user"></pl-external-grader-variables>
  <pl-file-editor
    file_name="user_code.py"
    ace_mode="ace/mode/python"
    source-file-name="tests/initial_code.py"></pl-file-editor>
</pl-question-panel>

<pl-submission-panel>
  <pl-external-grader-results />
</pl-submission-panel>
```

Note that the `<pl-external-grader-variables>` element is for purely decorative purposes only, `names_for_user` or `names_from_user` or both can be omitted without any negative results.

### `tests/setup_code.py`

This file is executed before any reference or student code is run.  Any variables defined in `names_for_user` can be accessed from here in student code, while the reference answer may freely access variables without restriction.  The code in this file is run only _once_ total for both student and reference code.  If you need to run some code before each (for example, to set a random seed), you may define the function `def repeated_setup()`, which will be executed before both.  `repeated_setup()` will always be run after the setup code itself is run.

### `tests/test.py`

The test cases for each coding problem are defined as methods of a `test` class contained in the aptly named `test.py` file.  The class will have one of the following signatures, depending if you require plots from the student:

```python
## No plot grading
class Test(PrairieLearnTestCase):

## Plot grading enabled
class Test(PrairieLearnTestCaseWithPlot):
```

These classes themselves extend `unittest.TestCase`, so any functionality from there is also available.

Each test case is a separate method in the class, the names of these functions must be prefixed with `test_`, but any name that follows is arbitrary.  Test cases are run in sorted order by the `unittest` library, so one convention that can be used is to give tests numeric names to ensure their running order.

Adding a name and point value to the test case is done by means of python decorators:
`@points(val)` and `@name("name of the test case")`.  These will control the name of the case and the points awarded in the "Test Results" dropdown menu that are shown when a student submits a solution.  An example of a definition:

```python
@points(10)
@name("Cool test case")
def test_0(self):
```

Inside the test case implementation, the student answer variables and reference answer variables can be accessed as children of the tuples `self.st` and `self.ref`, respectively.  There are various helper functions to check correctness of different types of variables, these are defined in `code_feedback.py`.  These are taken from the RELATE grader, so this may be familiar to those with prior experience with RELATE.

At the end of the test case, set the correctness of the answer using `feedback.set_percent()`.  This function takes a floating point number between 0 and 1 (inclusive), with 0 being completely *in*correct and 1 being completely correct.  By default, if no points are given the test case will be marked incorrect.

The overall structure of a test case should look something like:

```python
@points(10)
@name("name of the test case")
def test_0(self):
   if feedback.check_scalar('name of the variable', self.ref.variable_name, self.st.variable_names):
       Feedback.set_percent(1)
   else:
       Feedback.set_percent(0)
```

Note that `Feedback.set_percent()` is used to set the _percentage_ correctness of the test case.  For example, if a test case is worth 10 points and `Feedback.set_percent(0.5)` is run, the student will be awarded 5 points.

## General Tips and Gotchas

Note that the first argument of the `feedback.check_xx` functions is the name of the variable being checked, this will show up in the grader feedback if the student answers this problem incorrectly.

Be careful not to switch the ordering of the student and reference arguments.  The student answer is subject to more strict type checking, and there have been instances in the past where the grader has been broken by poorly formatted student answers.

## Banning/Disallowing library functions

One can hook into library in the setup code to disallow students from accessing certain functions.  This example is taken from the `demoAutograderNumpy` question.

By creating a `not_allowed` function that only raises an error when called:

```python
def not_allowed(*args, **kwargs):
    raise RuntimeError("Calling this function is not allowed")
```

and then setting library functions equal to `not_allowed`:

```python
numpy.linalg.inv = not_allowed
numpy.linalg.pinv = not_allowed
```

the `inv` and `pinv` functions will be effectively banned from use.  This will survive library reimports.

# Overview

![](grader-structure.png)

# Security

On the start of a grading job, the script `run.sh` is run with `root` privileges.  This will initialise directories and copy grading files into the correct location, delete itself, and generate a secret filename for the grading results using `uuidgen` which is saved into `output-fname.txt`. Then the actual grading script will then be run (`pltest.py`) as the user `ag`.

The grading Python scripts will load any sensitive files into memory (setup code, answer code, test cases, and output filename) and remove them from disk before running any student code.  Users therefore do not have access to question specific code, but only general grader logic which is publicly available.

After grading, results will be written to the secret filename generated above.  If this file does not exist or the filename does not match then the grading job will fail and students will not receive points.  This is mostly a failsafe in case the grader code were to crash, but in theory could also prevent crafty students from writing their own results file.

The grading job will now drop back to `root` in the `run.sh` script and will copy any output to the correct location, as expected by the external grading framework.
