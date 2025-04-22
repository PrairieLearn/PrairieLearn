## Question `server.py`

The `server.py` file for each question creates randomized question variants by generating random parameters and the corresponding correct answer. The `server.py` functions are:

| Function     | Return object                            | modifiable `data` keys                                                                                   | unmodifiable `data` keys                                                                                                                                                                                   | Description                                                                                                                                                                                                                                                                   |
| ------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate()` |                                          | `correct_answers`, `params`                                                                              | `options`, `variant_seed`                                                                                                                                                                                  | Generate the parameter and true answers for a new random question variant. Set `data["params"][name]` and `data["correct_answers"][name]` for any variables as needed. Modify the `data` dictionary in-place.                                                                 |
| `prepare()`  |                                          | `answers_names`, `correct_answers`, `params`                                                             | `options`, `variant_seed`                                                                                                                                                                                  | Final question preparation after element code has run. Can modify data as necessary. Modify the `data` dictionary in-place.                                                                                                                                                   |
| `render()`   | `html` (string)                          |                                                                                                          | `correct_answers`, `editable`, `feedback`, `format_errors`, `options`, `panel`, `params`, `partial_scores`, `raw_submitted_answers`, `score`, `submitted_answers`, `variant_seed`, `num_valid_submissions` | Render the HTML for one panel and return it as a string.                                                                                                                                                                                                                      |
| `parse()`    |                                          | `format_errors`, `submitted_answers`, `correct_answers`, `feedback`                                      | `options`, `params`, `raw_submitted_answers`, `variant_seed`                                                                                                                                               | Parse the `data["submitted_answers"][var]` data entered by the student, modifying this variable. Modify the `data` dictionary in-place.                                                                                                                                       |
| `grade()`    |                                          | `correct_answers`, `feedback`, `format_errors`, `params`, `partial_scores`, `score`, `submitted_answers` | `options`, `raw_submitted_answers`, `variant_seed`                                                                                                                                                         | Grade `data["submitted_answers"][var]` to determine a score. Store the score and any feedback in `data["partial_scores"][var]["score"]` and `data["partial_scores"][var]["feedback"]`. Modify the `data` dictionary in-place.                                                 |
| `file()`     | `object` (string, bytes-like, file-like) |                                                                                                          | `correct_answers`, `filename`, `options`, `params`, `variant_seed`                                                                                                                                         | Generate a file object dynamically in lieu of a physical file. Trigger via `type="dynamic"` in the question element (e.g., `pl-figure`, `pl-file-download`). Access the requested filename via `data['filename']`. If `file()` returns nothing, an empty string will be used. |

A complete `question.html` and `server.py` example looks like:

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
        data["score"] = 0.5
        data["feedback"]["y"] = "Your value for $y$ is larger than $x$, but incorrect."
```

## Question Data Storage

All persistent data related to a question variant is stored under different entries in the `data` dictionary. This dictionary is stored in JSON format by PrairieLearn, and as a result, everything in `data` must be JSON serializable. Some types in Python are natively JSON serializable, such as strings, lists, and dicts, while others are not, such as complex numbers, numpy ndarrays, and pandas DataFrames.

To account for this, the `prairielearn` Python library (usually aliased and used as `pl`), provides the functions [`to_json`][prairielearn.conversion_utils.to_json] and [`from_json`][prairielearn.conversion_utils.from_json] (part of [`conversion_utils.py`](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/python/prairielearn/conversion_utils.py)), which can respectively serialize and deserialize various objects for storage as part of question data. Please refer to the docstrings on those functions for more information. Here is a simple example:

```python title="server.py"
import numpy as np
import prairielearn as pl

def generate(data):
    data["params"]["numpy_array"] = pl.to_json(np.array([1.2, 3.5, 5.1]))

def grade(data):
    pl.from_json(data["params"]["numpy_array"])
```

The `pl.to_json` function supports keyword-only options for different types of encodings (e.g. `pl.to_json(var, df_encoding_version=2)`). These options have been added to allow for new encoding behavior while still retaining backwards compatibility with existing usage.

- `df_encoding_version` controls the encoding of Pandas DataFrames. Encoding a DataFrame `df` by setting `pl.to_json(df, df_encoding_version=2)` allows for missing and date time values whereas `pl.to_json(df, df_encoding_version=1)` (default) does not. However, `df_encoding_version=1` has support for complex numbers, while `df_encoding_version=2` does not.

- `np_encoding_version` controls the encoding of Numpy values. When using `np_encoding_version=1`, then only `np.float64` and `np.complex128` can be serialized by `pl.to_json`, and their types will be erased after deserialization (will become native Python `float` and `complex` respectively). It is recommended to set `np_encoding_version=2`, which supports serialization for all numpy scalars and does not result in type erasure on deserialization.

## Accessing files on disk

From within `server.py` functions, directories can be accessed as:

```python
data["options"]["question_path"]                      # on-disk location of the current question directory
data["options"]["client_files_question_path"]         # on-disk location of clientFilesQuestion/
data["options"]["client_files_question_url"]          # URL location of clientFilesQuestion/ (only in render() function)
data["options"]["client_files_question_dynamic_url"]  # URL location of dynamically-generated question files (only in render() function)
data["options"]["client_files_course_path"]           # on-disk location of clientFilesCourse/
data["options"]["client_files_course_url"]            # URL location of clientFilesCourse/ (only in render() function)
data["options"]["server_files_course_path"]           # on-disk location of serverFilesCourse/
```

## Generating dynamic files

You can dynamically generate file objects in `server.py`. These files never appear physically on the disk. They are generated in `file()` and returned as strings, bytes-like objects, or file-like objects. A complete `question.html` and `server.py` example using a dynamically generated `fig.png` looks like:

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

    if data["filename"] == "fig.png":                # check for the appropriate filename
        plt.plot([0, data["params"]["a"]], [0, 1])   # plot a line with slope "a"
        buf = io.BytesIO()                           # make a bytes object (a buffer)
        plt.savefig(buf, format="png")               # save the figure data into the buffer
        return buf
```

You can also use this functionality in file-based elements (`pl-figure`, `pl-file-download`) by setting `type="dynamic"`.
