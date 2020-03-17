# Python Autograder

This file documents the default Python autograder included in the `prairielearn/grader-python` Docker image.  For general information on how to set up an external grader, visit the [external grading](../externalGrading.md) page. 

## Setting up

### `info.json`

The question should be first set up to enable [external grading](../externalGrading.md), with `"gradingMethod": "External"` set in the `info.json` settings.  To use the specific Python autograder detailed in this document, `"image"` should be set to `"prairielearn/grader-python"` and `"entrypoint"` should point to `"/python_autograder/run.sh"` in the `"externalGradingOptions"` dictionary.

### `server.py`

The server code in the `generate()` function will define the list of variables that will be passed to the autograded student code `names_for_user`, and also those that will be passed from the student code to the test code `names_from_user`.  Only variables listed in `names_for_user` will be accessible by the user from the setup code; only variables listed in `names_from_user` will be accessible by the test cases from the user code.

These are stored as a list of dictionary objects in the `data["params"]` dict.  The above `names_for_user` and `names_from_user` lists are stored as a separate key in `params`. Each variable dictionary has the following format:
```json
{
    "name": "(name of the variable)",
    "description": "(Human readable description of the variable)",
    "type": "(Human readable type of the variable)
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

# Overview

![](grader-structure.png)

# Security

On the start of a grading job, the script `run.sh` is run with `root` privileges.  This will initialise directories and copy grading files into the correct location, delete itself, and generate a secret filename for the grading results using `uuidgen` which is saved into `output-fname.txt`. Then the actual grading script will then be run (`pltest.py`) as the user `ag`.

The grading Python scripts will load any sensitive files into memory (setup code, answer code, test cases, and output filename) and remove them from disk before running any student code.  Users therefore do not have access to question specific code, but only general grader logic which is publicly available.

After grading, results will be written to the secret filename generated above.  If this file does not exist or the filename does not match then the grading job will fail and students will not receive points.  This is mostly a failsafe in case the grader code were to crash, but in theory could also prevent crafty students from writing their own results file.

The grading job will now drop back to `root` in the `run.sh` script and will copy any output to the correct location, as expected by the external grading framework.
