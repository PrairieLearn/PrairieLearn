# `server.py`

The `server.py` file for each question creates randomized question variants by generating random parameters and the corresponding correct answers.

## Guide

To explain how this works, we will use a simple example of a question that asks the student to double a number. The question will look like this:

<!-- prettier-ignore -->
```html title="question.html"
<pl-question-panel>
  If $x = {{params.x}}$, what is $y$ if $y$ is double $x$?
</pl-question-panel>
<pl-number-input answers-name="y" label="$y =$"></pl-number-input>
<pl-submission-panel>
  {{feedback.y}}
</pl-submission-panel>
```

More details about the `{{params.x}}` and `{{feedback.y}}` syntax can be found in the [`question.html` documentation](./html.md).

### Step 1: `generate`

First, the `generate` function is called to generate random parameters for the variant, and the correct answers. It should set `data["params"]` with the parameters for the question, and `data["correct_answers"]` with the correct answers. The parameters can then be used in the `question.html` file by using `{{params.NAME}}`.

```python title="server.py"
import random

def generate(data):
    # Generate random parameters for the question and store them in the data["params"] dict:
    data["params"]["x"] = random.randint(5, 10)

    # Also compute the correct answer (if there is one) and store in the data["correct_answers"] dict:
    data["correct_answers"]["y"] = 2 * data["params"]["x"]
```

!!! info

    In general, each function of the question generation process runs *after* all elements in the question. For example, the `generate()` function in `server.py` runs after all elements have run their `generate()` functions. This is important to remember when using the `data` dictionary, as it will contain the results *after* the elements have finished processing.

### Step 2: `prepare`

Next, the `prepare` function is called after all elements (e.g. `<pl-number-input>`) have run `generate()`. This is typically done to do any sort of final post-processing, but is not commonly used.

### Step 3: `render`

Next, the `render(data)` function is called to render the question. You can use this function to override how the question is rendered. This is typically only used for more advanced questions.

### Step 4: `parse`

When a student submits their answer, the `parse` function is called to parse the submitted answers after the individual elements have parsed them. This function can be used to display more-specific format errors than the input elements or to parse the input differently. `<pl-number-input>` will have already parsed the submitted value as an integer, and display an error to the student if it was invalid. For this question, we will only allow the student to submit positive integers, so we will check for that and set a format error with `data["format_errors"]` if it is negative.

```python title="server.py"
def parse(data):
    # check we don't already have a format error, and if not, check if the answer is negative
    if "y" not in data["format_errors"] and data["submitted_answers"]["y"] < 0:
        data["format_errors"]["y"] = "Negative numbers are not allowed"
```

### Step 5: `grade`

Finally, the `grade(data)` function is called to grade the question. The grade function is responsible for:

- Setting the score and feedback for each named answer in `data["partial_scores"]`.
- Setting the total score for the question in `data["score"]`.
- Setting the overall feedback for the question in `data["feedback"]`.

It is recommended that you give additional feedback to the student as they make progress towards the solution, and reward this progress with partial credit.

If this function is not defined, the question will be graded automatically based on the correct answers set in `data["correct_answers"]`. Each answer the student provides will also be given feedback. If the function _is_ defined, the data you receive has already been graded by the elements. You should ensure you don't lower the score that was already given by the elements. In the example below, we accomplish this using the `marked_as_incorrect` variable, which is set to `True` only if all elements (in this case, there is only one) have marked the named answers as incorrect. In this case, it is safe to award partial credit.

You can also set `data["format_errors"]` to mark the submission as invalid. This will cause the question to not use up one of the student's attempts on assessments.

```python title="server.py"
import math

def grade(data):
    marked_as_incorrect = math.isclose(data["score"], 0.0)
    if marked_as_incorrect and data["submitted_answers"]["y"] > data["params"]["x"]:
        data["partial_scores"]["y"]["score"] = 0.5
        data["score"] = set_weighted_score_data(data)
        data["feedback"]["y"] = "Your value for $y$ is larger than $x$, but incorrect."
```

### Complete example

The finished, complete `question.html` and `server.py` example looks like:

```html title="question.html"
<pl-question-panel>
  <!-- params.x is defined by data["params"]["x"] in server.py's `generate()`. -->
  <!-- params.operation defined by in data["params"]["operation"] in server.py's `generate()`. -->
  If $x = {{params.x}}$ and $y$ is {{params.operation}} $x$, what is $y$?
</pl-question-panel>

<!-- y is defined by data["correct_answers"]["y"] in server.py's `generate()`. -->
<pl-number-input answers-name="y" label="$y =$"></pl-number-input>
<pl-submission-panel> {{feedback.y}} </pl-submission-panel>
```

```python title="server.py"
import random
import math

def generate(data):
    # Generate random parameters for the question and store them in the data["params"] dict:
    data["params"]["x"] = random.randint(5, 10)
    data["params"]["operation"] = random.choice(["double", "triple"])

    # Also compute the correct answer (if there is one) and store in the data["correct_answers"] dict:
    if data["params"]["operation"] == "double":
        data["correct_answers"]["y"] = 2 * data["params"]["x"]
    else:
        data["correct_answers"]["y"] = 3 * data["params"]["x"]

def prepare(data):
    # This function will run after all elements have run `generate()`.
    # We can alter any of the element data here, but this is rarely needed.
    pass

def parse(data):
    # data["raw_submitted_answers"][NAME] is the exact raw answer submitted by the student.
    # data["submitted_answers"][NAME] is the answer parsed by elements (e.g., strings converted to numbers).
    # data["format_errors"][NAME] is the answer format error (if any) from elements.
    # We can modify or delete format errors if we have custom logic (rarely needed).
    # If there are format errors then the submission is "invalid" and is not graded.
    # To provide feedback but keep the submission "valid", data["feedback"][NAME] can be used.

    # As an example, we will reject negative numbers for "y":
    # check we don't already have a format error
    if "y" not in data["format_errors"] and data["submitted_answers"]["y"] < 0:
        data["format_errors"]["y"] = "Negative numbers are not allowed"

def grade(data):
    # All elements will have already graded their answers (if any) before this point.
    # data["partial_scores"][NAME]["score"] is the individual element scores (0 to 1).
    # data["score"] is the total score for the question (0 to 1).
    # We can modify or delete any of these if we have a custom grading method.
    # This function only runs if `parse()` did not produce format errors, so we can assume all data is valid.

    # grade(data) can also set data['format_errors'][NAME] if there is any reason to mark the question
    # invalid during grading time.  This will cause the question to not use up one of the student's attempts' on exams.
    # You are encouraged, though, to do any checks for invalid data that can be done in `parse(data)` there instead,
    # since that method is also called when the student hits "Save only", in manually graded questions, or in
    # assessments without real-time grading.

    # As an example, we will give half points for incorrect answers larger than "x",
    # only if not already correct. Use math.isclose to avoid possible floating point errors.
    if math.isclose(data["score"], 0.0) and data["submitted_answers"]["y"] > data["params"]["x"]:
        data["partial_scores"]["y"]["score"] = 0.5
        data["score"] = set_weighted_score_data(data)
        data["feedback"]["y"] = "Your value for $y$ is larger than $x$, but incorrect."
```

## `server.py` functions

This table summarizes the functions that can be defined in `server.py`.

| Function     | Updates `data`?    | Modifiable `data` keys                                                                                   | Description                                                                                                                                                                                                                                                                   |
| ------------ | ------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate()` | :white_check_mark: | `correct_answers`, `params`                                                                              | Generate the parameter and true answers for a new random question variant. Set `data["params"][name]` and `data["correct_answers"][name]` for any variables as needed. Modify the `data` dictionary in-place.                                                                 |
| `prepare()`  | :white_check_mark: | `answers_names`, `correct_answers`, `params`                                                             | Final question preparation after element code has run. Can modify data as necessary. Modify the `data` dictionary in-place.                                                                                                                                                   |
| `render()`   | :x:                | N/A. Returns `html` as a string                                                                          | Render the HTML for one panel and return it as a string.                                                                                                                                                                                                                      |
| `parse()`    | :white_check_mark: | `format_errors`, `submitted_answers`, `correct_answers`, `feedback`                                      | Parse the `data["submitted_answers"][var]` data entered by the student, modifying this variable. Modify the `data` dictionary in-place.                                                                                                                                       |
| `grade()`    | :white_check_mark: | `correct_answers`, `feedback`, `format_errors`, `params`, `partial_scores`, `score`, `submitted_answers` | Grade `data["submitted_answers"][var]` to determine a score. Store the score and any feedback in `data["partial_scores"][var]["score"]` and `data["partial_scores"][var]["feedback"]`. Modify the `data` dictionary in-place.                                                 |
| `file()`     | :x:                | N/A. Returns an `object` (string, bytes-like, file-like)                                                 | Generate a file object dynamically in lieu of a physical file. Trigger via `type="dynamic"` in the question element (e.g., `pl-figure`, `pl-file-download`). Access the requested filename via `data['filename']`. If `file()` returns nothing, an empty string will be used. |

As shown in the table, most functions accept a single argument, `data` (a dictionary), and modify it in place.

### `data` dictionary

| Attribute               | Type    | Description                                                                                                                          |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `params`                | `dict`  | Parameters for the question variant. These are set in the `generate()` function and can be used in the `question.html` file.         |
| `correct_answers`       | `dict`  | Correct answers for the question variant. Each item maps from a named answer to a value.                                             |
| `submitted_answers`     | `dict`  | Student answers submitted for the question after parsing.                                                                            |
| `raw_submitted_answers` | `dict`  | Raw student answers submitted for the question.                                                                                      |
| `format_errors`         | `dict`  | Dictionary of format errors for each answer. Each item maps from a named answer to a error message.                                  |
| `partial_scores`        | `dict`  | Dictionary of partial scores for each answer. Each entry is a dictionary with the keys `score` (float) and `weight` (int, optional). |
| `score`                 | `float` | The total score for the question variant.                                                                                            |
| `feedback`              | `dict`  | Dictionary of feedback for each answer. Each item maps from a named answer to a feedback message.                                    |

The key `data` fields and their types are described above. You can view a full list of all fields in the [`QuestionData` reference](../python-reference/prairielearn/question_utils.md#prairielearn.question_utils.QuestionData).

## Question data storage

All persistent data related to a question variant is stored under different entries in the `data` dictionary. This dictionary is stored in JSON format by PrairieLearn, and as a result, **everything in `data` must be JSON serializable**. Some types in Python are natively JSON serializable, such as strings, lists, and dicts, while others are not, such as complex numbers, numpy ndarrays, and pandas DataFrames.

The `prairielearn` Python library provides the utility functions [`to_json`][prairielearn.conversion_utils.to_json] and [`from_json`][prairielearn.conversion_utils.from_json] (part of [`conversion_utils.py`](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/python/prairielearn/conversion_utils.py)), which can serialize and deserialize various objects for storage as part of question data. Please refer to the documentation for those functions for additional information. Here is a simple example of how to use them to store and retrieve a numpy array:

```python title="server.py"
import numpy as np
import prairielearn as pl

def generate(data):
    data["params"]["numpy_array"] = pl.to_json(np.array([1.2, 3.5, 5.1]))

def grade(data):
    pl.from_json(data["params"]["numpy_array"])
```

The [`pl.to_json`][prairielearn.conversion_utils.to_json] function supports keyword-only options for different types of encodings (e.g. `pl.to_json(var, df_encoding_version=2)`). These options have been added to allow for new encoding behavior while still retaining backwards compatibility with existing usage.

- `df_encoding_version` controls the encoding of Pandas DataFrames. Encoding a DataFrame `df` by setting `pl.to_json(df, df_encoding_version=2)` allows for missing and date time values whereas `pl.to_json(df, df_encoding_version=1)` (default) does not. However, `df_encoding_version=1` has support for complex numbers, while `df_encoding_version=2` does not.

- `np_encoding_version` controls the encoding of Numpy values. When using `np_encoding_version=1`, then only `np.float64` and `np.complex128` can be serialized by `pl.to_json`, and their types will be erased after deserialization (will become native Python `float` and `complex` respectively). It is recommended to set `np_encoding_version=2`, which supports serialization for all numpy scalars and does not result in type erasure on deserialization.

## Accessing files on disk

From within `server.py` functions, directories can be accessed as:

```python
# on-disk location of the current question directory
data["options"]["question_path"]

# on-disk location of clientFilesQuestion/
data["options"]["client_files_question_path"]

# URL location of clientFilesQuestion/ (only in render() function)
data["options"]["client_files_question_url"]

# URL location of dynamically-generated question files (only in render() function)
data["options"]["client_files_question_dynamic_url"]

# on-disk location of clientFilesCourse/
data["options"]["client_files_course_path"]

# URL location of clientFilesCourse/ (only in render() function)
data["options"]["client_files_course_url"]

# on-disk location of serverFilesCourse/
data["options"]["server_files_course_path"]
```

## Generating dynamic files with `file()`

You can dynamically generate file objects in `server.py`. These files never appear physically on the disk. They are generated in `file()` and returned as strings, bytes-like objects, or file-like objects. These files are generated before the question is rendered in `question.html`. A complete `question.html` and `server.py` example using a dynamically generated `fig.png` looks like:

```html title="question.html"
<p>Here is a dynamically-rendered figure showing a line of slope $a = {{params.a}}$:</p>
<img src="{{options.client_files_question_dynamic_url}}/fig.png" />
```

```python title="server.py"
import random
import io
import matplotlib.pyplot as plt

def generate(data):
    data["params"]["a"] = random.choice([0.25, 0.5, 1, 2, 4])

def file(data):
    # We should look at data["filename"], generate the corresponding file,
    # and return the contents of the file as a string, bytes-like, or file-like object.
    # We can access data["params"].
    # As an example, we will generate the "fig.png" figure.

    # check for the appropriate filename
    if data["filename"] == "fig.png":
        # plot a line with slope "a"
        plt.plot([0, data["params"]["a"]], [0, 1])
        # make a bytes object (a buffer)
        buf = io.BytesIO()
        # save the figure data into the buffer
        plt.savefig(buf, format="png")
        return buf
```

You can also use this functionality in file-based elements (`pl-figure`, `pl-file-download`) by setting `type="dynamic"`.

## Custom grading best practices

Although questions with custom grading usually don't use the grading functions from individual elements, it is _highly_ recommended that built-in elements are used for student input, as these elements include helpful parsing and feedback by default. Parsed student answers are present in the `data["submitted_answers"]` dictionary.

!!! note

    Data stored under the `"submitted_answers"` key in the data dictionary may be of varying type. Specifically, the `pl-integer-input`
    element sometimes stores very large integers as strings instead of the Python `int` type used in most cases. The best practice for custom grader
    code in this case is to always cast the data to the desired type, for example `int(data["submitted_answers"][name])`. See the
    [PrairieLearn elements documentation](../elements.md) for more detailed discussion related to specific elements.

### Recalculating scores

Any custom grading function for the whole question should set `data["score"]` as a value between 0.0 and 1.0, which will be the final score for the given question. If a custom grading function is only grading a specific part of a question, the grading function should set the corresponding dictionary entry in `data["partial_scores"]` and then recompute the final `data["score"]` value for the whole question. The `prairielearn` Python library provides the following score recomputation functions:

- [`set_weighted_score_data`][prairielearn.question_utils.set_weighted_score_data] sets `data["score"]` to be the weighted average of entries in `data["partial_scores"]`.
- [`set_all_or_nothing_score_data`][prairielearn.question_utils.set_all_or_nothing_score_data] sets `data["score"]` to 1.0 if all entries in `data["partial_scores"]` are 1.0, 0.0 otherwise.

This can be used like so:

```python title="server.py"
from prairielearn import set_weighted_score_data

def grade(data):
    # update partial_scores as necessary
    # ...

    # compute total question score
    set_weighted_score_data(data)
```

More detailed information can be found in the [grading utilities documentation](../python-reference/prairielearn/grading_utils.md). If you prefer not to show score badges for individual parts, you may unset the dictionary entries in `data["partial_scores"]` once `data["score"]` has been computed.

### Custom feedback

To set custom feedback, the grading function should set the corresponding entry in the `data["feedback"]` dictionary. These feedback entries are passed in when rendering the `question.html`, which can be accessed by using the mustache prefix `{{feedback.}}`. See the [above example](#complete-example) or [this demo question](https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/custom/gradeFunction) for examples of this. Note that the feedback set in the `data["feedback"]` dictionary is meant for use by custom grader code in a `server.py` file, while the feedback set in `data["partial_scores"]` is meant for use by element grader code.

### Parameter generation

For generated floating point answers, it's important to use consistent rounding when displaying numbers to students _and_ when computing the correct answer. For example, the following is problematic:

```python title="server.py"
def generate(data):
    a = 33.33337
    b = 33.33333
    data["params"]["a_for_student"] = f'{a:.2f}'
    data["params"]["b_for_student"] = f'{a:.2f}'
    # Note how the correct answer is computed with full precision,
    # but the parameters displayed to students are rounded.
    data["correct_answers"]["c"] = a - b
```

Instead, the numbers should be rounded at the beginning:

```python title="server.py"
def generate(data):
  a = np.round(33.33337, 2)
  b = np.round(33.33333, 2)
  data["params"]["a_for_student"] = f'{a:.2f}'
  data["params"]["b_for_student"] = f'{b:.2f}'
  data["correct_answers"]["c"] = a - b
```

### Grading floating-point answers

For grading functions involving floating point numbers, _avoid exact comparisons with `==`._ Floating point calculations in Python introduce error, and comparisons with `==` might unexpectedly fail. Instead, the function [`math.isclose`](https://docs.python.org/3/library/math.html#math.isclose) can be used, as it performs comparisons within given tolerance. The `prairielearn` Python library also offers several functions to perform more specialized comparisons:

- [`is_correct_scalar_ra`][prairielearn.grading_utils.is_correct_scalar_ra] compares floats using relative and absolute tolerances.
- [`is_correct_scalar_sf`][prairielearn.grading_utils.is_correct_scalar_sf] compares floats up to a specified number of significant figures.
- [`is_correct_scalar_dd`][prairielearn.grading_utils.is_correct_scalar_dd] compares floats up to a specified number of digits.
