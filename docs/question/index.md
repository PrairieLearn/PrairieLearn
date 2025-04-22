# Questions

**NOTE:** Any time you edit a question `info.json` file on a local copy of PrairieLearn, you need to click “Load from disk” to reload the changes. Edits to HTML or Python files can be picked up by reloading the page. You might need to generate a new variant of a question to run new Python code.

**NOTE:** New-style PrairieLearn questions are marked with `"type": "v3"`. This documentation only describes new-style questions, although old-style v2 questions are still supported in the code.

## Directory structure

Questions are all stored inside the `questions` directory (or any subfolder) for a course. Each question is a single directory that contains all the files for that question. The name of the full question directory relative to `questions` is the QID (the "question ID") for that question. For example, here are three different questions:

```text
questions
|
|-- fossilFuelsRadio          # first question, id is "fossilFuelsRadio"
|   |
|   +-- info.json             # metadata for the fossilFuelsRadio question
|   +-- server.py             # secret server-side code (optional)
|   `-- question.html         # HTML template for the question
|
|-- addVectors                # second question, id is "addVectors"
|   |
|   +-- info.json             # metadata for the addVectors question
|   +-- server.py
|   +-- question.html
|   +-- notes.docx            # more files, like notes on how the question works
|   +-- solution.docx         # these are secret (can't be seen by students)
|   |
|   +-- clientFilesQuestion/  # Files accessible to the client (web browser)
|   |   `-- fig1.png          # A client file (an image)
|   |
|   +-- tests/                # external grading files (see other doc)
|       `-- ...
|
`-- subfolder                 # a subfolder we can put questions in -- this itself can't be a question
    |
    `-- nestedQuestion        # third question, id is "subfolder/nestedQuestion"
        |
        +-- info.json         # metadata for the "subfolder/nestedQuestion" question
        `-- question.html
```

PrairieLearn assumes independent questions; nothing ties them together. However, each question could have multiple parts (inputs that are validated together).

Example questions are in the [`exampleCourse/questions`](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/questions) directory inside PrairieLearn.

## Question `info.json`

The `info.json` file for each question defines properties of the question. For example:

```json title="info.json"
{
  "uuid": "cbf5cbf2-6458-4f13-a418-aa4d2b1093ff",
  "title": "Newton's third law",
  "topic": "Forces",
  "tags": ["secret", "Fa18"],
  "type": "v3",
  "comment": "You can add comments to JSON files using this property."
}
```

| Property                 | Type    | Description                                                                                                                                                            |
| ------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uuid`                   | string  | [Unique identifier](../uuid.md). (Required; no default)                                                                                                                |
| `type`                   | enum    | Type of the test. Must be `"v3"` for new-style questions. (Required; no default)                                                                                       |
| `title`                  | string  | The title of the question (e.g., `"Addition of vectors in Cartesian coordinates"`). (Required; no default)                                                             |
| `topic`                  | string  | The category of question (e.g., `"Vectors"`, `"Energy"`). Like the chapter in a textbook. (Required; no default)                                                       |
| `tags`                   | array   | Optional extra tags associated with the question (e.g., `["secret", "concept"]`). (Optional; default: no tags)                                                         |
| `gradingMethod`          | enum    | The grading method used for auto-grading this question. Valid values: `Internal`, `External`, or `Manual` (for manual-only questions). (Optional; default: `Internal`) |
| `singleVariant`          | boolean | Whether the question is not randomized and only generates a single variant. (Optional; default: `false`)                                                               |
| `showCorrectAnswer`      | boolean | Whether the question should display the answer panel. (Optional; default: `true`)                                                                                      |
| `partialCredit`          | boolean | Whether the question will give partial points for fractional scores. (Optional; default: `true`)                                                                       |
| `externalGradingOptions` | object  | Options for externally graded questions. See the [external grading docs](../externalGrading.md). (Optional; default: none)                                             |
| `dependencies`           | object  | External JavaScript or CSS dependencies to load. See below. (Optional; default: `{}`)                                                                                  |
| `sharePublicly`          | boolean | Whether the question should be available for anyone to preview or use in their course                                                                                  |
| `shareSourcePublicly`    | boolean | Whether the source code of the question should be available                                                                                                            |
| `sharingSets`            | array   | Sharing sets which the question belongs to                                                                                                                             |

See the [reference for `infoQuestion.json`](../schemas/infoQuestion.md) for more information about what can be added to this file.

### Question Dependencies

Your question can load client-side assets such as scripts or stylesheets from different sources. A full list of dependencies will be compiled based on the question's needs and any dependencies needed by page elements, then they will be deduplicated and loaded onto the page.

These dependencies are specified in the `info.json` file, and can be configured as follows:

```json title="info.json"
{
  "dependencies": {
    "nodeModulesScripts": ["three/build/three.min.js"],
    "clientFilesQuestionScripts": ["my-question-script.js"],
    "clientFilesQuestionStyles": ["my-question-style.css"],
    "clientFilesCourseStyles": ["courseStylesheet1.css", "courseStylesheet2.css"]
  }
}
```

### Question Sharing

Any question that is marked with `"sharePublicly": true` or `"shareSourcePublicly": true` will be considered and displayed as being published for free use under the [CC-BY-NC](https://www.creativecommons.org/licenses/by-nc/4.0/) license. Questions may be privately shared to individual courses using sharing sets, as explained in the [sharing documentation](../questionSharing.md). Sharing sets that a question belongs to are specified as a list of strings. These must match sharing sets that are declared in the [course configuration](../course/index.md#adding-sharing-sets).

```json title="info.json"
{
  "sharingSets": ["python-exercises"]
}
```

The different types of dependency properties available are summarized in this table:

| Property                     | Description                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `nodeModulesStyles`          | The styles required by this question, relative to `[PrairieLearn directory]/node_modules`.        |
| `nodeModulesScripts`         | The scripts required by this question, relative to `[PrairieLearn directory]/node_modules`.       |
| `clientFilesQuestionStyles`  | The scripts required by this question relative to the question's `clientFilesQuestion` directory. |
| `clientFilesQuestionScripts` | The scripts required by this question relative to the question's `clientFilesQuestion` directory. |
| `clientFilesCourseStyles`    | The styles required by this question relative to `[course directory]/clientFilesCourse`.          |
| `clientFilesCourseScripts`   | The scripts required by this question relative to `[course directory]/clientFilesCourse`.         |

## Question `question.html`

The `question.html` is a template used to render the question to the student. A complete `question.html` example looks like:

```html title="question.html"
<pl-question-panel>
  <p>
    A particle of mass $m = {{params.m}}\rm\ kg$ is observed to have acceleration $a =
    {{params.a}}\rm\ m/s^2$.
  </p>
  <p>What is the total force $F$ currently acting on the particle?</p>
</pl-question-panel>

<p>
  <pl-number-input
    answers-name="F"
    comparison="sigfig"
    digits="2"
    label="$F =$"
    suffix="$\rm m/s^2$"
  ></pl-number-input>
</p>
```

The `question.html` is regular HTML, with four special features:

1. Any text in double-curly-braces (like `{{params.m}}`) is substituted with variable values. If you use triple-braces (like `{{{params.html}}}`) then raw HTML is substituted (don't use this unless you know you need it). This is using [Mustache](https://mustache.github.io/mustache.5.html) templating.

2. Special HTML elements (like `<pl-number-input>`) enable input and formatted output. See the [list of PrairieLearn elements](../elements.md). Note that that **all submission elements must have unique `answers-name` attributes.** This is necessary for questions to be graded properly.

3. A special `<markdown>` tag allows you to write Markdown inline in questions.

4. LaTeX equations are available within HTML by using `$x^2$` for inline equations, and `$$x^2$$` or `\[x^2\]` for display equations.

## Question `server.py`

## The `singleVariant` option for non-randomized questions

While it is recommended that all questions contain random parameters, sometimes it is impractical to do this. For questions that don't have a meaningful amount of randomization in them, the `info.json` file should set `"singleVariant": true`. This has the following effects:

- On `Homework`-type assessments, each student will only ever be given one variant of the question, which they can repeatedly attempt without limit. The correct answer will never be shown to students.
- On `Exam`-type assessments, all questions are effectively single-variant, so the `singleVariant` option has no effect.

## The `partialCredit` option

By default, all questions award partial credit. For example, if there are two numeric answers in a question and only one of them is correct, the student will be awarded 50% of the available points.

To disable partial credit for a question, set `"partialCredit": false` in the `info.json` file for the question. This will mean that the question will either give 0% or 100%, and it will only give 100% if every element on the page is fully correct. Some [question elements](../elements.md) also provide more fine-grained control over partial credit.

In general, it is _strongly_ recommended to leave partial credit enabled for all questions.

## Options for grading student answers

For most elements, there are four different ways of auto-grading the student answer. This applies to elements like [`pl-number-input`](../elements.md#pl-number-input-element) and [`pl-string-input`](../elements.md#pl-string-input-element) that allow students to input an answer of their choosing, but not [`pl-multiple-choice`](../elements.md#pl-multiple-choice-element) or [`pl-checkbox`](../elements.md#pl-checkbox-element) that are much more constrained. The four ways are:

1. Set the correct answer using the correct-answer attributes for each element in `question.html`. This will use the built-in grading methods for each element. Given that this option is typically used for answers with a hard-coded value, without randomization, it is not expected to be used frequently.

2. Set `data["correct_answers"][VAR_NAME]` in `server.py`. This is for questions where you can pre-compute a single correct answer based on the (randomized) parameters.

3. Write a [custom `grade(data)`](#question-serverpy) function in server.py that checks `data["submitted_answers"][VAR_NAME]` and sets scores. This can do anything, including having multiple correct answers, testing properties of the submitted answer for correctness, compute correct answers of some elements based on the value of other elements, etc.

4. Write an [external grader](../externalGrading.md), though this is typically applied to more complex questions like coding.

If a question has more than one of the above options, each of them overrides the one before it. Even if options 3 (custom grade function) or 4 (external grader) are used, then it can still be helpful to set a correct answer so that it is shown to students as a sample of what would be accepted. If there are multiple correct answers then it's probably a good idea to add a note with [`pl-answer-panel`](../elements.md#pl-answer-panel-element) that any correct answer would be accepted, and the displayed answer is only an example. Moreover, if there is no relevant information to display on the correct answer panel (i.e., a question has multiple correct answers and is meant to be attempted until a full score is achieved), then the panel can be hidden by setting `showCorrectAnswer: false` in `info.json`.

### Custom grading best practices

Although questions with custom grading usually don't use the grading functions from individual elements, it is _highly_ recommended that built-in elements are used for student input, as these elements include helpful parsing and feedback by default. Parsed student answers are present in the `data["submitted_answers"]` dictionary.

Any custom grading function for the whole question should set `data["score"]` as a value between 0.0 and 1.0, which will be the final score for the given question. If a custom grading function is only grading a specific part of a question, the grading function should set the corresponding dictionary entry in `data["partial_scores"]` and then recompute the final `data["score"]` value for the whole question. The [`question_utils.py`](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/python/prairielearn/question_utils.py) file from the `prairielearn` Python library provides the following score recomputation functions:

- [`set_weighted_score_data`][prairielearn.question_utils.set_weighted_score_data] sets `data["score"]` to be the weighted average of entries in `data["partial_scores"]`.
- [`set_all_or_nothing_score_data`][prairielearn.question_utils.set_all_or_nothing_score_data] sets `data["score"]` to 1.0 if all entries in `data["partial_scores"]` are 1.0, 0.0 otherwise.

This can be used like so:

```python
from prairielearn import set_weighted_score_data

def grade(data):
    # update partial_scores as necessary
    # ...

    # compute total question score
    set_weighted_score_data(data)
```

More detailed information can be found in the docstrings for these functions. If you prefer not to show score badges for individual parts, you may unset the dictionary entries in `data["partial_scores"]` once `data["score"]` has been computed.

To set custom feedback, the grading function should set the corresponding entry in the `data["feedback"]` dictionary. These feedback entries are passed in when rendering the `question.html`, which can be accessed by using the mustache prefix `{{feedback.}}`. See the [above question](#question-serverpy) or [this demo question](https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/custom/gradeFunction) for examples of this. Note that the feedback set in the `data["feedback"]` dictionary is meant for use by custom grader code in a `server.py` file, while the feedback set in `data["partial_scores"]` is meant for use by element grader code.

For generated floating point answers, it's important to use consistent rounding when displaying numbers to students _and_ when computing the correct answer. For example, the following is problematic:

```python
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

```python
def generate(data):
  a = np.round(33.33337, 2)
  b = np.round(33.33333, 2)
  data["params"]["a_for_student"] = f'{a:.2f}'
  data["params"]["b_for_student"] = f'{b:.2f}'
  data["correct_answers"]["c"] = a - b
```

Similarly, for grading functions involving floating point numbers, _avoid exact comparisons with `==`._ Floating point calculations in Python introduce error, and comparisons with `==` might unexpectedly fail. Instead, the function [`math.isclose`](https://docs.python.org/3/library/math.html#math.isclose) can be used, as it performs comparisons within given tolerance values. The [`grading_utils.py`](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/python/prairielearn/grading_utils.py) file from the `prairielearn` Python library also offers several functions to perform more specialized comparisons:

- [`is_correct_scalar_ra`][prairielearn.grading_utils.is_correct_scalar_ra] compares floats using relative and absolute tolerances.
- [`is_correct_scalar_sf`][prairielearn.grading_utils.is_correct_scalar_sf] compares floats up to a specified number of significant figures.
- [`is_correct_scalar_dd`][prairielearn.grading_utils.is_correct_scalar_dd] compares floats up to a specified number of digits.

More detailed information can be found in the docstrings for these functions.

_Note:_ Data stored under the `"submitted_answers"` key in the data dictionary may be of varying type. Specifically, the `pl-integer-input`
element sometimes stores very large integers as strings instead of the Python `int` type used in most cases. The best practice for custom grader
code in this case is to always cast the data to the desired type, for example `int(data["submitted_answers"][name])`. See the
[PrairieLearn elements documentation](../elements.md) for more detailed discussion related to specific elements.
