
# Elements for use in `question.html`

## `pl_multiple_choice` element

```html
<pl_multiple_choice answers_name="acc" weight="1" inline="true">
  <pl_answer correct="false">positive</pl_answer>
  <pl_answer correct="true">negative</pl_answer>
  <pl_answer correct="false">zero</pl_answer>
</pl_multiple_choice>
```

Attribute | Type | Default | Description
--- | --- | --- | ---
`answers_name` | string | — | Variable name to store data in.
`weight` | integer | 1 | Weight to use when computing a weighted average score over elements.
`inline` | boolean | false | List answer choices on a single line instead of as separate paragraphs.
`number_answers` | integer | special | The total number of answer choices to display. Defaults to displaying one correct answer and all incorrect answers.
`fixed_order` | boolean | false | Disable the randomization of answer order.

A `pl_multiple_choice` element selects one correct answer and zero or more incorrect answers and displays them in a random order as radio buttons.

An `pl_answer` element inside a `pl_multiple_choice` element has attributes:

Attribute | Type | Default | Description
--- | --- | --- | ---
`correct` | boolean | false | Is this a correct answer to the question?

## `pl_checkbox` element

```html
<pl_checkbox answers_name="vpos" weight="1" inline="true">
  <pl_answer correct="true">A-B</pl_answer>
  <pl_answer correct="true">B-C</pl_answer>
  <pl_answer>               C-D</pl_answer>
  <pl_answer correct="true">D-E</pl_answer>
  <pl_answer>               E-F</pl_answer>
  <pl_answer>               F-G</pl_answer>
</pl_checkbox>
```

Attribute | Type | Default | Description
--- | --- | --- | ---
`answers_name` | string | — | Variable name to store data in.
`weight` | integer | 1 | Weight to use when computing a weighted average score over elements.
`inline` | boolean | false | List answer choices on a single line instead of as separate paragraphs.
`number_answers` | integer | special | The total number of answer choices to display. Defaults to displaying all answers.
`min_correct` | integer | special | The minimum number of correct answers to display. Defaults to displaying all correct answers.
`max_correct` | integer | special | The maximum number of correct answers to display. Defaults to displaying all correct answers.
`fixed_order` | boolean | false | Disable the randomization of answer order.

A `pl_checkbox` element displays a subset of the answers in a random order as checkboxes.

An `pl_answer` element inside a `pl_multiple_choice` element has attributes:

Attribute | Type | Default | Description
--- | --- | --- | ---
`correct` | boolean | false | Is this a correct answer to the question?

## `pl_number_input` element

```html
<pl_number_input answers_name="v_avg" comparison="sigfig" digits="2" />
```

Attribute | Type | Default | Description
--- | --- | --- | ---
`answers_name` | string | — | Variable name to store data in.
`weight` | integer | 1 | Weight to use when computing a weighted average score over elements.
`correct_answer` | float | special | Correct answer for grading. Defaults to `data["correct_answers"][answers_name]`.
`label` | text | — | A prefix to display before the input box (e.g., `label="$F =$"`).
`suffix` | text | — | A suffix to display after the input box (e.g., `suffix="$\rm m/s^2$"`).
`display` | "block" or "inline" | "inline" | How to display the input field.
`comparison` | "relabs", "sigfig", or "decdig" | "relabs" | How to grade. "relabs" uses relative ("rtol") and absolute ("atol") tolerances. "sigfig" and "decdig" use "digits" significant or decimal digits.
`rtol` | number | 1e-5 | Relative tolerance for `comparison="relabs"`.
`atol` | number | 1e-8 | Absolute tolerance for `comparison="relabs"`.
`digits` | integer | 2 | number of digits that must be correct for `comparison="sigfig"` or `comparison="decdig"`.
`eps_digits` | integer | 3 | Additional digits (beyond `digits`) used to compute a grace tolerance.

## `pl_matrix_output` element

```html
<pl_matrix_output digits="3">
    <variable params_name="A">A</variable>
    <variable params_name="B">B</variable>
</pl_matrix_output>
```

Attributes for `<pl_matrix_output`:

Attribute | Type | Default | Description
--- | --- | --- | ---
`digits` | integer | — | Number of digits to display after the decimal.

Attributes for `<variable>` (one of these for each variable to display):

Attribute | Type | Default | Description
--- | --- | --- | ---
`params_name` | string | — | Name of variable in `data['params']` to display.

This element displays a list of variables inside `<pre>` tags that are formatted for import into either MATLAB or python (the user can switch between the two). Each variable must be either a scalar or a 2D numpy array (expressed as a list). Each variable will be prefixed by the text that appears between the `<variable>` and `</variable>` tags, followed by ` = `.

Here is an example of MATLAB format:
```
A = [1.23; 4.56];
```

Here is an example of python format:
```
import numpy as np

A = np.array([[1.23], [4.56]])
```


## `pl_figure` element

```html
<!-- show a figure from an existing file -->
<pl_figure file_name="figure.png" directory="clientFilesCourse" />

<!-- show a figure from a file that is generated by code -->
<pl_figure file_name="figure.png" type="dynamic" />
```

Attribute | Type | Default | Description
--- | --- | --- | ---
`file_name` | string | — | Name of image file.
`type` | text | 'static' | Type of file, either 'static' (an existing file) or 'dynamic' (a file generated by element or server code).
`directory` | text | "clientFilesQuestion" | The directory that contains the file, either 'clientFilesQuestion' or 'clientFilesCourse' (see [client and server files](clientServerFiles.md)). A directory cannot be specified if `type='dynamic'`.
`width` | number | `None` | Width of image (e.g., '250px').

If `type="dynamic"`, then the contents of the image file must be returned by a function `file()` that is located either in element code or in `server.py`. The contents must be a string (with utf-8 encoding), a bytes-like object, or a file-like object. The filename will be available to this function as `data['filename']`. For example, this code might appear in `server.py` to generate a file called `figure.png`:

```python
def file(data):
    if data['filename']=='figure.png':
        plt.plot([1,2,3],[3,4,-2])
        buf = io.BytesIO()
        plt.savefig(buf,format='png')
        return buf
```

If `file()` does not return anything, it will be treated as if `file()` returned the empty string.

## `pl_file_download` element

```html
<!-- allow students to download an existing file -->
<pl_file_download file_name="data.txt" directory="clientFilesCourse" />

<!-- allow students to download a file that is generated by code -->
<pl_file_download file_name="data.txt" type="dynamic" />
```

Attribute | Type | Default | Description
--- | --- | --- | ---
`file_name` | string | — | Name of file to download.
`label` | text | file_name | Alternate text for file download link (e.g., `label="click here to download"`).
`type` | text | "static" | Type of file, either "static" (an existing file) or "dynamic" (a file generated by element or server code).
`directory` | text | "clientFilesQuestion" | The directory that contains the file, either "clientFilesQuestion" or "clientFilesCourse" (see [client and server files](clientServerFiles.md)). A directory cannot be specified if `type="dynamic"`.

If `type="dynamic"`, then the contents of the file must be returned by a function `file()` that is located either in element code or in `server.py`. The contents must be a string (with utf-8 encoding), a bytes-like object, or a file-like object. The filename will be available to this function as `data['filename']`. For example, this code might appear in `server.py` to generate a file called `data.txt`:

```python
def file(data):
    if data['filename']=='data.txt':
        return 'This data is generated by code.'
```

If `file()` does not return anything, it will be treated as if `file()` returned the empty string.

## `pl_file_upload` element

```html
<pl_file_upload file_names="foo.py, bar.c, filename with\, comma.txt" />
```

Provides a way to accept file uploads as part of an answer. They will be stored
in [the format expected by externally graded questions](externalGrading.md#file-submission-format).

Attribute | Type | Default | description
--- | --- | --- | ---
`answers_name` | string | \_file | Variable name to store data in. **For externally graded questions, you should rely on the default.**
`file_names` | CSV list | "" | List of files that should and must be submitted. Commas in a filename should be escaped with a backslash, and filenames cannot contain quotes.

## `pl_file_editor` element

```html
<pl_file_editor
  file_name="fib.py"
  ace_mode="ace/mode/python"
  ace_theme="ace/theme/monokai"
>
def fib(n):
    pass
</pl_file_editor>
```

Provides an in-broswer file editor that's compatible with the other file elements
and external grading system.

Attribute | Type | Default | description
--- | --- | --- | ---
`file_name` | string | - | The name of this file; will be used to store this file in the `_files` submitted answer
`ace_mode` | string | None | Specifies an Ace editor mode to enable things like intelligent code indenting and syntax highlighting; see the full list of modes [here](https://github.com/ajaxorg/ace/tree/master/lib/ace/mode).
`ace_theme` | string | `ace/theme/chrome` | Specifies an Ace editor theme; see the full list of themes [here](https://github.com/ajaxorg/ace/tree/master/lib/ace/theme).

## `pl_external_grader_results` element

```html
<pl_external_grader_results></pl_external_grader_results>
```

Displays results from externally-graded questions. It expects results to follow
[the reference schema for external grading results](externalGrading.md#grading-result).

## `pl_question_panel` element

```html
<pl_question_panel>
  This is question-panel text.
</pl_question_panel>
```

Only display contents when rendering the question panel.

## `pl_submission_panel` element

```html
<pl_submission_panel>
  This is submission-panel text.
</pl_submission_panel>
```

Only display contents when rendering the submission panel.

## `pl_answer_panel` element

```html
<pl_answer_panel>
  This is answer-panel text.
</pl_answer_panel>
```

Only display contents when rendering the answer panel.

## `pl_variable_score` element

```html
<pl_variable_score answers_name="v_avg" />
```

Attribute | Type | Default | Description
--- | --- | --- | ---
`answers_name` | string | — | Variable name to display score for.

Display the partial score for a specific answer variable.
