# Python autograder

The Python autograder grades student Python code with [pytest](https://docs.pytest.org/). It's published as the `prairielearn/grader-python-pytest` Docker image and is built on the [`pytest-prairielearn-grader`](https://github.com/PrairieLearn/grader-python-v2) plugin. Student code runs in a separate, sandboxed process, and test cases query it for variables and call its functions. For general information on how to set up an external grader, see the [external grading](../externalGrading.md) documentation.

This page covers how to set up a question. The [quick start guide](https://github.com/PrairieLearn/grader-python-v2/blob/main/quick_start.md) documents every feature of the grader in detail.

!!! tip "Converting existing questions"

    Questions that use the older `prairielearn/grader-python` image, with `tests/test.py` and `PLTestCase`, can be converted by following the [conversion guide](https://github.com/PrairieLearn/grader-python-v2/blob/main/converting.md). The guide is written so that you can also give it to an AI coding agent to do the conversion.

## Setting up

### `info.json`

Set `"gradingMethod": "External"`, and set `"image"` in `"externalGradingOptions"` to one of the grader's images. The `entrypoint` property doesn't need to be provided.

```json title="info.json"
{
  "uuid": "...",
  "title": "...",
  "topic": "...",
  "tags": ["..."],
  "type": "v3",
  "gradingMethod": "External",
  "externalGradingOptions": {
    "image": "prairielearn/grader-python-pytest:latest",
    "timeout": 30
  }
}
```

Two images are published. Use the smallest one that has what your question needs:

| Image                                      | Includes                                                                                                         | Use for                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `prairielearn/grader-python-pytest:lite`   | The grader and the Python standard library                                                                       | Questions where student code and tests only use the standard library |
| `prairielearn/grader-python-pytest:latest` | The scientific Python stack, such as `numpy`, `pandas`, `scipy`, `matplotlib` and `sympy`, plus notebook support | Everything else                                                      |

### `question.html`

The question needs a way for students to submit files, such as [`pl-file-editor`](../elements/pl-file-editor.md), [`pl-file-upload`](../elements/pl-file-upload.md) or a [workspace](../workspaces/index.md). The submission panel should contain [`pl-external-grader-results`](../elements/pl-external-grader-results.md) to show the results, and [`pl-file-preview`](../elements/pl-file-preview.md) so that students can see their submitted code.

```html title="question.html"
<pl-question-panel>
  <pl-external-grader-variables params-name="names_from_user">
    <pl-variable name="fib" type="python function"
      >Function to compute the $n^\text{th}$ Fibonacci number</pl-variable
    >
  </pl-external-grader-variables>
  <pl-file-editor
    file-name="student_code.py"
    ace-mode="ace/mode/python"
    source-file-name="tests/initial_code.py"
  >
  </pl-file-editor>
</pl-question-panel>

<pl-submission-panel>
  <pl-external-grader-results></pl-external-grader-results>
  <pl-file-preview></pl-file-preview>
</pl-submission-panel>
```

The grader looks for a file matching `student_code*.py` by default. To grade a file with another name, set `student_code_pattern` in the [configuration](#configuration).

[`pl-external-grader-variables`](../elements/pl-external-grader-variables.md) shows students a table of variables. With `params-name="names_for_user"`, it also sets which variables from the setup code are given to student code. See [Setup code](#setup-code).

### The `tests` directory

| File                     | Purpose                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `tests/test_student.py`  | Required. The test cases.                                                                              |
| `tests/initial_code.py`  | Optional. Starter code, shown by `pl-file-editor` with `source-file-name`. The grader doesn't read it. |
| `tests/setup_code.py`    | Optional. Runs before the student's code, for example to generate random inputs.                       |
| `tests/leading_code.py`  | Optional. Prepended to the student's code, so student code can use anything it defines.                |
| `tests/trailing_code.py` | Optional. Appended to the student's code.                                                              |

Make sure that starter code can be run as is. A submission with a syntax error is marked as ungradable: the student doesn't lose an attempt, but doesn't get any test results either.

## Writing tests

Each test case is a function in `tests/test_student.py` whose name starts with `test_`. Tests run in the order they appear in the file. Here's part of the test file for the [`demo/autograder/codeEditor`][demo/autograder/codeeditor] example question:

```python title="tests/test_student.py"
import pytest
from pytest_prairielearn_grader.assertions import assert_fn_equal
from pytest_prairielearn_grader.fixture import StudentFixture
from pytest_prairielearn_grader.utils import GradingOutputLevel


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="Check fib(1)", points=1)
def test_fib_1(sandbox: StudentFixture) -> None:
    assert_fn_equal(sandbox, "fib", args=(1,), expected=1, description="fib(1)")


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="Check fib(7)", points=2)
def test_fib_7(sandbox: StudentFixture) -> None:
    assert_fn_equal(sandbox, "fib", args=(7,), expected=13, description="fib(7)")
```

- **`@pytest.mark.grading_data(name=..., points=...)`** sets the name that students see and the points the test is worth.
- **`@pytest.mark.output(level=...)`** sets how much of a failure students see. With `GradingOutputLevel.Friendly`, they see only the assertion's message, without the exception name or traceback.
- **The `sandbox` fixture** gives the test access to the student's code. Each test that uses it gets a fresh run of the setup code and student code.

### Querying student code

| Method                                         | Returns                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sandbox.query("x")`                           | The value of the student's variable `x`.                                                                                                             |
| `sandbox.query_function("f", *args, **kwargs)` | The return value of the student's function `f`. Takes an optional `query_timeout`, which defaults to 1 second.                                       |
| `sandbox.query_function_raw("f", *args)`       | A dict with the `status` (such as `"success"`, `"exception"` or `"timeout"`), the `value` and any exception, for tests that check errors themselves. |
| `sandbox.query_setup("x")`                     | The value of the variable `x` in the setup code.                                                                                                     |
| `sandbox.get_accumulated_stdout()`             | Everything the student's code has printed.                                                                                                           |

If the student didn't define a name, `query` and `query_function` raise an error that fails the test with a message saying so. Values sent back from student code have to be serializable: numbers, strings, `None`, lists, dicts, numpy arrays, pandas DataFrames, and plots built with [`plot-serializer`](https://github.com/PrairieLearn/grader-python-v2/blob/main/quick_start.md#testing-matplotlib-plots).

### Checking answers

The `pytest_prairielearn_grader.assertions` module has helpers that give students readable messages:

- `assert_equal(value, expected, description=...)` compares a value, and `assert_approx_equal(...)` compares a number with a tolerance.
- `assert_fn_equal(sandbox, "f", args=..., expected=...)` and `assert_fn_approx_equal(...)` call a student function and compare its return value.
- `assert_true(condition, msg=...)` and `assert_false(...)` show only your message.

The comparison helpers show students the expected value. For test cases whose answer should stay hidden, use `assert_true` with a message that doesn't include it. Avoid bare `assert` statements and assertions such as `numpy.testing.assert_allclose`, because their messages also show the expected value. For example, to check a numpy array:

```python
value = sandbox.query("x")
assert_true(isinstance(value, np.ndarray), msg="x should be a numpy array")
assert_true(value.shape == expected.shape, msg=f"x should have shape {expected.shape}")
assert_true(np.allclose(value, expected), msg="x is inaccurate")
```

### Partial credit

A test that finishes without failing gets full points. To give partial credit, add the `feedback` fixture and call `feedback.set_score()` with a fraction between 0 and 1 as checks pass. A test that fails keeps the last score it set:

```python
@pytest.mark.grading_data(name="Multi-step", points=10)
def test_multi_step(sandbox: StudentFixture, feedback: FeedbackFixture) -> None:
    assert_fn_equal(sandbox, "initialize", expected=0)
    feedback.set_score(0.5)

    assert_fn_equal(sandbox, "compute", args=(10,), expected=100)
    feedback.set_score(1.0)
```

`feedback.set_score_final()` sets a score that stands even if the test fails afterwards, and `feedback.add_message()` adds a message for the student.

### Other fixtures

- `data_json`: the question's `data`, such as `data_json["params"]` from `server.py`.
- `tests_dir`: the path of the `tests` directory, for reading data files in tests.
- `module_sandbox`: like `sandbox`, but shared by all tests in the file, so state carries over between them.
- `workspace_sandbox`: for multi-file projects from a [workspace](#workspaces-and-notebooks).

## Setup code

`tests/setup_code.py` runs in the sandbox before the student's code. Student code gets only the setup variables listed in `names_for_user`, which usually comes from `<pl-external-grader-variables params-name="names_for_user">` in `question.html`. This example is from the [`demo/autograder/python/square`][demo/autograder/python/square] question:

```python title="tests/setup_code.py"
import random

x = random.random()
```

```python title="tests/test_student.py"
@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="x_sq", points=10)
def test_x_sq(sandbox: StudentFixture) -> None:
    x = sandbox.query_setup("x")
    assert_approx_equal(sandbox.query("x_sq"), x**2, description="x_sq")
```

- **Fresh values.** The setup code runs again for each test, so read random values with `sandbox.query_setup` in the test that uses them.
- **Parameters.** Setup code can read `data["params"]` as `__data_params`. Values that `server.py` stored with `pl.to_json` are still encoded: decode them with `__from_server_json(__data_params["A"])`.
- **Restrictions.** Setup code has the same builtins and import restrictions as student code. For example, it can't call `open`.

## Configuration

To change the grader's settings, create a `ConfigObject` named `autograder_config` at the top of `tests/test_student.py`:

```python title="tests/test_student.py"
from pytest_prairielearn_grader import ConfigObject

autograder_config = ConfigObject(
    student_code_pattern="user_code.py",
    # Importing numpy in student code can take longer than the default timeout.
    sandbox_timeout=15,
)
```

| Setting                                                     | Use                                                                                                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `sandbox_timeout`                                           | Seconds allowed for the setup code and student code to start. The default is 1, so increase it when student code imports large libraries. |
| `student_code_pattern`                                      | The file name, or glob pattern, of the student's file.                                                                                    |
| `output_level`                                              | The default output level for all tests, such as `"friendly"`.                                                                             |
| `import_whitelist`, `import_blacklist`, `builtin_whitelist` | Which modules and builtins student code can use. `os`, `sys`, `subprocess`, `pathlib` and `shutil` are blocked by default.                |
| `names_for_user`, `starting_vars`                           | Variables to give student code, when they don't come from `pl-external-grader-variables`.                                                 |
| `helper_modules`                                            | Modules in `tests/` that setup code, leading code and student code can import.                                                            |
| `data_files`                                                | Files in `tests/` that setup code, leading code and student code can read by relative path.                                               |
| `notebook_cell_tag`                                         | Only grade the notebook cells that start with this tag, such as `"#grade"`.                                                               |
| `workspace_mode`                                            | Grade a multi-file project with `workspace_sandbox`.                                                                                      |

See the [quick start guide](https://github.com/PrairieLearn/grader-python-v2/blob/main/quick_start.md#configuration-with-configobject) for every setting.

## Disallowing library functions

To stop students from using a library function, replace it in the setup code:

```python title="tests/setup_code.py"
import numpy.linalg as la


def not_allowed(*args, **kwargs):
    raise RuntimeError("Usage of this function is not allowed in this question.")


la.inv = not_allowed
```

Python is a highly dynamic language, so students with enough knowledge of Python can get around this. For stronger guarantees about which functions are used, check submissions with [manual grading](../manualGrading/index.md).

## Workspaces and notebooks

For a question where students submit a Jupyter notebook from a [workspace](../workspaces/index.md), set `student_code_pattern` to the notebook's name from `gradedFiles`. To grade only some cells, set `notebook_cell_tag`. For example, with `notebook_cell_tag="#grade"`, only the code cells whose first line starts with `#grade` run. Tests are written the same way as for `.py` files.

For a workspace with several `.py` files that import each other, set `workspace_mode=True` and use the `workspace_sandbox` fixture, which queries names by module path, such as `"utils.helpers.clamp"`. See [Workspace Grading](https://github.com/PrairieLearn/grader-python-v2/blob/main/quick_start.md#workspace-grading).

## Testing a question locally

The grader runs the files in `/grade` in the same way it does in PrairieLearn, so you can test a question with Docker before syncing it:

```bash
mkdir -p grade/tests grade/student grade/data
cp -R path/to/question/tests/. grade/tests/
cp solution.py grade/student/student_code.py
echo '{"params": {}}' > grade/data/data.json
docker run --rm -v "$PWD/grade:/grade" prairielearn/grader-python-pytest:latest
cat grade/results/results.json
```

Put in `params` whatever the question's `server.py` and elements would set, such as `names_for_user`. The grader moves files around, so start each run from a fresh copy. You can also [run PrairieLearn locally](../installing.md#support-for-external-graders-and-workspaces) with external grading enabled.

## Security

- **Sandbox.** Student code runs in a separate process as an unprivileged user, with a limited set of builtins and import restrictions. Dangerous builtins such as `open`, `eval` and `exec` aren't available.
- **Grading data.** `data.json`, which can contain `correct_answers`, is readable only by the grader, not by student code.
- **What students can read.** `__data_params` and any `helper_modules` and `data_files` are available to student code, so they mustn't contain answers.
- **Import restrictions.** These only check `import` statements, so they aren't a security boundary on their own. For example, a module that student code is allowed to import can expose `os` as an attribute.

## Example questions

- [demo/autograder/codeEditor]: a function question with partial credit.
- [demo/autograder/python/square]: setup code and `query_setup`.
- [demo/autograder/python/pandas]: checking a DataFrame.
- [demo/autograder/python/randomFunctionName]: parameters from `server.py` and handling timeouts.

[demo/autograder/codeeditor]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/codeEditor
[demo/autograder/python/pandas]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/python/pandas
[demo/autograder/python/randomfunctionname]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/python/randomFunctionName
[demo/autograder/python/square]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/python/square
