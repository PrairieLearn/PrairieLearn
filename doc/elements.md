
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
`hide_help_text` | boolean | false | Hide help text stating to pick one or more optinos. 
`detailed_help_text` | boolean | false | Display detailed information in help text about the number of options to choose. 

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
`rtol` | number | 1e-2 | Relative tolerance for `comparison="relabs"`.
`atol` | number | 1e-8 | Absolute tolerance for `comparison="relabs"`.
`digits` | integer | 2 | number of digits that must be correct for `comparison="sigfig"` or `comparison="decdig"`.
`allow_complex` | boolean | False | Whether or not to allow complex numbers as answers. If the correct answer `ans` is a complex object, you should use `import prairielearn as pl` and `data['correct_answer'][answers_name] = pl.to_json(ans)`.

## `pl_matrix_input` element

```html
<pl_matrix_input answers_name="C" comparison="sigfig" digits="3" label="$AB=$" />
```

Attribute | Type | Default | Description
--- | --- | --- | ---
`answers_name` | string | — | Variable name to store data in.
`weight` | integer | 1 | Weight to use when computing a weighted average score over elements.
`correct_answer` | float | special | Correct answer for grading. Defaults to `data["correct_answers"][answers_name]`.
`label` | text | — | A prefix to display before the input box (e.g., `label="$F =$"`).
`comparison` | "relabs", "sigfig", or "decdig" | "relabs" | How to grade. "relabs" uses relative ("rtol") and absolute ("atol") tolerances. "sigfig" and "decdig" use "digits" significant or decimal digits.
`rtol` | number | 1e-2 | Relative tolerance for `comparison="relabs"`.
`atol` | number | 1e-8 | Absolute tolerance for `comparison="relabs"`.
`digits` | integer | 2 | number of digits that must be correct for `comparison="sigfig"` or `comparison="decdig"`.
`allow_complex` | boolean | False | Whether or not to allow complex numbers as answers. If the correct answer `ans` is a complex object, you should use `import prairielearn as pl` and `data['correct_answer'][answers_name] = pl.to_json(ans)`.

In the question panel, a `pl_matrix_input` element displays an input field that accepts a matrix (i.e., a 2-D array) expressed either in matlab or python format.

Here is an example of valid MATLAB format:
```
[1.23; 4.56]
```

Here is an example of valid python format:
```
[[1.23], [4.56]]
```

A scalar will be accepted either as a matrix of size $1\times 1$ (e.g., `[1.23]` or `[[1.23]]`) or just as a single number (e.g., `1.23`).

In the answer panel, a `pl_matrix_input` element displays the correct answer, allowing the user to switch between matlab and python format.

In the submission panel, a `pl_matrix_input` element displays either the submitted answer (in the same format that it was submitted, either matlab or python), or a note that the submitted answer was invalid (with an explanation of why).

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

If a variable `v` is a complex object, you should use `import prairielearn as pl` and `data['params'][params_name] = pl.to_json(v)`.


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

## `pl_threejs` element

```html
<pl_threejs answer_name="a">
    <pl_threejs_stl file_name="MAKE_Robot_V6.stl" frame="body" scale="0.1" />
    <pl_threejs_stl file_name="MAKE_Robot_V6.stl" frame="body" scale="0.025" position="[-1,1,2]" orientation="[0,0,30]" />
    <pl_threejs_txt frame="body" position="[-1,1,2.6]" orientation="[0,0,30]">mini-me</pl_threejs_txt>
</pl_threejs>
```

This element displays a 3D scene with objects that the student can (optionally) translate and/or rotate. It can be used only for output (e.g., as part of a question that asks for something else to be submitted). Or, it can be used for input (e.g., comparing a submitted pose of the body-fixed objects to a correct orientation). Information about the current pose can be hidden from the student and, if visible, can be displayed in a variety of formats, so the element can be used for many different types of questions.

Attribute | Type | Default | Description
--- | --- | --- | ---
`answer_name` | string | — | Variable name to store data in.
`body_position` | list | [0, 0, 0] | Initial position of body as `[x, y, z]`.
`body_orientation` | list | special | Initial orientation of body. Defaults to zero orientation (body frame aligned with space frame). Interpretation depends on `body_pose_format`.
`camera_position` | list | [5, 2, 2] | Initial position of camera as `[x, y, z]`.
`body_cantranslate` | boolean | true | If you can translate the body in the UI.
`body_canrotate` | boolean | true | If you can rotate the body in the UI.
`camera_canmove` | boolean | true | If you can move the camera (i.e., change the view) in the UI.
`body_pose_format` | string | rpy | Determines how `body_orientation` is interpreted. If `rpy` then `[roll, pitch, yaw]`. If `matrix` then 3x3 rotation matrix `[[...], [...], [...]]`. If `quaternion` then `[x, y, z, w]`. If `axisangle` then `[x, y, z, theta]` where `x, y, z` are coordinates of axis and `theta` is angle.
`answer_pose_format` | string | rpy | Determines how the answer `data['correct_answer'][answer_name]` is interpreted. If `homogeneous`, then the answer must be a 4x4 homogeneous transformation matrix `[[...], [...], [...], [...]]`. Otherwise, the answer must be a list with two elements. The first element must describe position as `[x, y, z]`. The second element must describe orientation, interpreted based on `answer_pose_format`. If `rpy` then `[roll, pitch, yaw]`. If `matrix` then 3x3 rotation matrix `[[...], [...], [...]]`. If `quaternion` then `[x, y, z, w]`. If `axisangle` then `[x, y, z, theta]` where `x, y, z` are coordinates of axis and `theta` is angle.
`text_pose_format` | string | matrix | Determines how the pose of the body is displayed as text. If `matrix` then position is `[x, y, z]` and orientation is a 3x3 rotation matrix. If `quaternion` then position is `[x, y, z]` and orientation is `[x, y, z, w]`. If `homogeneous` then pose is a 4x4 homogeneous transformation matrix.
`show_pose_in_question` | boolean | true | If the current pose of the body is displayed in the question panel.
`show_pose_in_correct_answer` | boolean | true | If the current pose of the body is displayed in the correct answer panel.
`show_pose_in_submitted_answer` | boolean | true | If the current pose of the body is displayed in the submitted answer panel.
`tol_position` | float | 0.5 | Error in position must be no more than this for the answer to be marked correct.
`tol_rotation` | float | 5.0 | Error in rotation must be no more than this for the answer to be marked correct.
`grade` | boolean | true | If the element will be graded, i.e., if it is being used to ask a question. If `grade` is `false`, then this element will never produce any html in the answer panel or in the submission panel.

A `pl_threejs_stl` element inside a `pl_threejs` element allows you to add a mesh described by an `stl` file to the scene, and has these attributes:
Attribute | Type | Default | Description
--- | --- | --- | ---
`file_name` | string | — | Name of `.stl` file.
`file_directory` | string | clientFilesQuestion | Location of `.stl` file, either `clientFilesCourse` or `clientFilesQuestion`.
`frame` | string | body | Which frame the object is fixed to, either `body` or `space`.
`color` | color | special | Color of object as CSS string, defaults to `#e84a27` if body-fixed and to `#13294b` if space-fixed.
`opacity` | float | special | Opacity of object, defaults to `0.7` if body-fixed and to `0.4` if space-fixed.
`position` | list | [0, 0, 0] | Position of object as `[x, y, z]`.
`orientation` | list | special | Orientation of object. Defaults to zero orientation. Interpretation depends on `format`.
`format` | string | rpy | Determines how `orientation` is interpreted. If `rpy` then `[roll, pitch, yaw]`. If `matrix` then 3x3 rotation matrix `[[...], [...], [...]]`. If `quaternion` then `[x, y, z, w]`. If `axisangle` then `[x, y, z, theta]` where `x, y, z` are coordinates of axis and `theta` is angle.

A `pl_threejs_txt` element inside a `pl_threejs` element allows you to add whatever text appears between the `<pl_threejs_txt> ... </pl_threejs_txt>` tags as a mesh to the scene, and has these attributes:
Attribute | Type | Default | Description
--- | --- | --- | ---
`frame` | string | body | Which frame the object is fixed to, either `body` or `space`.
`color` | color | special | Color of object as CSS string, defaults to `#e84a27` if body-fixed and to `#13294b` if space-fixed.
`opacity` | float | special | Opacity of object, defaults to `0.7` if body-fixed and to `0.4` if space-fixed.
`position` | list | [0, 0, 0] | Position of object as `[x, y, z]`.
`orientation` | list | special | Orientation of object. Defaults to zero orientation. Interpretation depends on `format`.
`format` | string | rpy | Determines how `orientation` is interpreted. If `rpy` then `[roll, pitch, yaw]`. If `matrix` then 3x3 rotation matrix `[[...], [...], [...]]`. If `quaternion` then `[x, y, z, w]`. If `axisangle` then `[x, y, z, theta]` where `x, y, z` are coordinates of axis and `theta` is angle.

Note that a 3D scene is also created to show each submitted answer. This means that if there are many submitted answers, the page will load slowly.


## pl_code

```html
<pl_code language="python">
def square(x):
    return x * x
</pl_code>
```

This element displays a block of code with syntax highlighting.

Attribute | Type | Default | Description
--- | --- | --- | ---
`language` | string | — | The programming language syntax highlighting to use. See below for options.
`no_highlight` | boolean | false | Disable highlighting.

The `language` can be one of the following values.

`language` value | Description
--- | ---
`armasm` | ARM Assembly
`bash` | Bash
`cpp` | C++
`csharp` | C#
`css` | CSS
`excel` | Excel
`fortran` | Fortran
`go` | Go
`haskell` | Haskell
`html` | HTML,XML
`ini` | Ini
`java` | Java
`javascript` | JavaScript
`json` | JSON
`julia` | Julia
`makefile` | Makefile
`markdown` | Markdown
`mathematica` | Mathematica
`matlab` | Matlab
`mipsasm` | MIPS Assembly
`objectivec` | Objective-C
`ocaml` | OCaml
`perl` | Perl
`php` | PHP
`python` | Python
`r` | R
`ruby` | Ruby
`shell` | Shell Session
`sql` | SQL
`tex` | TeX
`x86asm` | Intel x86 Assembly
`yaml` | YAML

Please let the PrairieLearn developers know if you need a language that is not on the list above (any [highlight.js](https://highlightjs.org) language could be added).
