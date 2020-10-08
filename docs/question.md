
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

```json
{
    "uuid": "cbf5cbf2-6458-4f13-a418-aa4d2b1093ff",
    "title": "Newton's third law",
    "topic": "Forces",
    "tags": ["secret", "Fa18"],
    "type": "v3"
}
```

Property | Type | Description
--- | --- | ---
`uuid` | string | [Unique identifier](uuid.md). (Required; no default)
`type` | enum | Type of the test. Must be `"v3"` for new-style questions. (Required; no default)
`title` | string | The title of the question (e.g., `"Addition of vectors in Cartesian coordinates"`). (Required; no default)
`topic` | string | The category of question (e.g., `"Vectors"`, `"Energy"`). Like the chapter in a textbook. (Required; no default)
`tags` | array | Optional extra tags associated with the question (e.g., `["secret", "concept"]`). (Optional; default: no tags)
`gradingMethod` | enum | The grading method used for this question. Valid values: `Internal`, `External`, or `Manual`. (Optional; default: `Internal`)
`singleVariant` | boolean | Whether the question is not randomized and only generates a single variant. (Optional; default: `false`)
`partialCredit` | boolean | Whether the question will give partial points for fractional scores. (Optional; default: `true`)
`externalGradingOptions` | object | Options for externally graded questions. See the [external grading docs](externalGrading.md). (Optional; default: none)
`dependencies` | object | External JavaScript or CSS dependencies to load.  See below.  (Optional; default: `{}`)

For details see the [format specification for question `info.json`](https://github.com/PrairieLearn/PrairieLearn/blob/master/schemas/schemas/infoQuestion.json)

### Question Dependencies

Your question can load client-side assets such as scripts or stylesheets from different sources.  A full list of dependencies will be compiled based on the question's needs and any dependencies needed by page elements, then they will be de-duped and loaded onto the page.

These dependencies are specified in the `info.json` file, and can be configured as follows:

```json
{
    "dependencies": {
        "coreScripts": [
            "d3.min.js"
        ],
        "nodeModulesScripts": [
            "three/build/three.min.js"
        ],
        "clientFilesQuestionScripts": [
            "my-question-script.js"
        ],
        "clientFilesQuestionStyles": [
            "my-question-style.css"
        ],
        "clientFilesCourseStyles": [
            "courseStylesheet1.css",
            "courseStylesheet2.css"
        ]
    }
}
```

The different types of dependency properties available are summarized in this table:

Property | Description
--- | ---
`coreStyles` |  The styles required by this question, relative to `[PrairieLearn directory]/public/stylesheets`.
`coreScripts` | The scripts required by this question, relative to `[PrairieLearn directory]/public/javascripts`.
`nodeModulesStyles` | The styles required by this question, relative to `[PrairieLearn directory]/node_modules`.
`nodeModulesScripts` | The scripts required by this question, relative to `[PrairieLearn directory]/node_modules`.
`clientFilesQuestionStyles` | The scripts required by this question relative to the question's `clientFilesQuestion` directory.
`clientFilesQuestionScripts` | The scripts required by this question relative to the question's `clientFilesQuestion` directory.
`clientFilesCourseStyles` | The styles required by this question relative to `[course directory]/clientFilesCourse`.
`clientFilesCourseScripts` | The scripts required by this question relative to `[course directory]/clientFilesCourse`. 

## Question `question.html`

The `question.html` is a template used to render the question to the student. A complete `question.html` example looks like:

```html
<pl-question-panel>
  <p> A particle of mass $m = {{params.m}}\rm\ kg$ is observed to have acceleration $a = {{params.a}}\rm\ m/s^2$.
  <p> What is the total force $F$ currently acting on the particle?
</pl-question-panel>

<p>$F = $ <pl-number-input answers_name="F" comparison="sigfig" digits="2" /> $\rm m/s^2$
```

The `question.html` is regular HTML, with four special features:

1. Any text in double-curly-braces (like `{{params.m}}`) is substituted with variable values. If you use triple-braces (like `{{{params.html}}}`) then raw HTML is substituted (don't use this unless you know you need it). This is using [Mustache](https://mustache.github.io/mustache.5.html) templating.

2. Special HTML elements (like `<pl-number-input>`) enable input and formatted output. See the [list of PrairieLearn elements](elements.md).
   
3. A special `<markdown>` tag allows you to write Markdown inline in questions.

4. LaTeX equations are available within HTML by using `$x^2$` for inline equations, and `$$x^2$$` or `\[x^2\]` for display equations.

## Question `server.py`

The `server.py` file for each question creates randomized question variants by generating random parameters and the corresponding correct answer. The `server.py` functions are:

Function | Return object | modifiable `data` keys | unmodifiable `data` keys | Description
--- | --- | --- | --- | ---
`generate()` | | `correct_answers`, `params` | `options`, `variant_seed` | Generate the parameter and true answers for a new random question variant. Set `data["params"][name]` and `data["correct_answers"][name]` for any variables as needed. Return the modified `data` dictionary.
`prepare()` | | `correct_answers`, `params` | `options`, `variant_seed` | Final question preparation after element code has run. Can modify data as necessary. Return the modified `data` dictionary.
`render()` | `html` (string) | | `correct_answers`, `editable`, `feedback`, `format_errors`, `options`, `panel`, `params`, `partial_scores`, `raw_submitted_answers`, `score`, `submitted_answers`, `variant_seed` | Render the HTML for one panel and return it as a string.
`parse()` | | `format_errors`, `submitted_answers` | `correct_answers`, `options`, `params`, `raw_submitted_answers`, `variant_seed` | Parse the `data["submitted_answers"][var]` data entered by the student, modifying this variable. Return the modified `data` dictionary.
`grade()` | | `correct_answers`, `feedback`, `format_errors`, `params`, `partial_scores`, `score`, `submitted_answers` | `options`, `raw_submitted_answers`, `variant_seed` | Grade `data["submitted_answers"][var]` to determine a score. Store the score and any feedback in `data["partial_scores"][var]["score"]` and `data["partial_scores"][var]["feedback"]`. Return the modified `data` dictionary.
`file()` | `object` (string, bytes-like, file-like) | | `correct_answers`, `filename`, `options`, `params`, `variant_seed` | Generate a file object dynamically in lieu of a physical file. Trigger via `type="dynamic"` in the question element (e.g., `pl-figure`, `pl-file-download`). Access the requested filename via `data['filename']`. If `file()` returns nothing, an empty string will be used.

A complete `question.html` and `server.py` example looks like:

```html
<!-- question.html -->

<pl-question-panel>
  <!-- params.x is defined by data["params"]["x"] in server.py's `generate()`. -->
  <!-- params.operation defined by in data["params"]["operation"] in server.py's `generate()`. -->
  If $x = {{params.x}}$ and $y$ is {{params.operation}} $x$, what is $y$?
</pl-question-panel>

<!-- y is defined by data["correct_answer"]["y"] in server.py's `generate()`. -->
<pl-number-input answers-name="y" label="$y =$"></pl-number-input>
```

```python
# server.py

import random

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
    # data["raw_submitted_answer"][NAME] is the exact raw answer submitted by the student.
    # data["submitted_answer"][NAME] is the answer parsed by elements (e.g., strings converted to numbers).
    # data["format_errors"][NAME] is the answer format error (if any) from elements.
    # We can modify or delete format errors if we have custom logic (rarely needed).
    # If there are format errors then the submission is "invalid" and is not graded.

    # As an example, we will reject negative numbers for "y":
    if "y" not in data["format_errors"]: # check we don't already have a format error
        if data["submitted_answers"]["y"] < 0:
            data["format_errors"]["y"] = "Negative numbers are not allowed"

def grade(data):
    # All elements will have already graded their answers (if any) before this point.
    # data["partial_scores"][NAME] is the individual element scores (0 to 1).
    # data["score"] is the total score for the question (0 to 1).
    # We can modify or delete any of these if we have a custom grading method.
    # This function only runs if `parse()` did not produce format errors, so we can assume all data is valid.

    # grade() can also set `data['format_errors'][NAME]` if there is any reason to mark the question
    # invalid during grading time.  This will cause the question to not use up one of the student's attempts' on exams.

    # As an example, we will give half points for incorrect answers larger than "x":
    if data["score"] == 0: # only if not already correct
        if data["submitted_answers"]["y"] > data["params"]["x"]:
            data["partial_scores"]["y"] = 0.5
            data["score"] = 0.5
```

## Generating dynamic files

You can dynamically generate file objects in `server.py`. These files never appear physically on the disk. They are generated in `file()` and returned as strings, bytes-like objects, or file-like objects. A complete `question.html` and `server.py` example using a dynamically generated `fig.png` looks like:

```html
<!-- question.html -->

<p>Here is a dynamically-rendered figure showing a line of slope $a = {{params.a}}$:</p>
<img src="{{options.client_files_question_dynamic_url}}/fig.png" />
```

```python
# server.py

import random, io, matplotlib.pyplot as plt

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

## The `singleVariant` option for non-randomized questions

While it is recommended that all questions contain random parameters, sometimes it is impractical to do this. For questions that don't have a meaningful amount of randomization in them, the `info.json` file should set `"singleVariant": true`. This has the following effects:

* On `Homework`-type assessments, each student will only ever be given one variant of the question, which they can repeatedly attempt without limit. The correct answer will never be shown to students.
* On `Exam`-type assessments, the `singleVariant` option has no effect and the question is treated like any other.

## The `partialCredit` option

By default, all questions award partial credit. For example, if there are two numeric answers in a question and only one of them is correct, the student will be awarded 50% of the available points.

To disable partial credit for a question, set `"partialCredit": false` in the `info.json` file for the question. This will mean that the question will either give 0% or 100%, and it will only give 100% if every element on the page is fully correct. Some [question elements](elements.md) also provide more fine-grained control over partial credit.

In general, it is strongly recommended to leave partial credit enabled for all questions.

## Using Markdown in questions

HTML and custom elements are great for flexibility and expressiveness. However, they're not great for working with large amounts of text, formatting text, and so on. [Markdown](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet) is a lightweight plaintext markup syntax that's ideal for authoring simple but rich text. To enable this, PrairieLearn adds a special `<markdown>` tag to questions. When a `<markdown>` block is encountered, its contents are converted to HTML. Here's an example `question.html` that utilizes this element:

```html
<markdown>
# Hello, world!

This is some **Markdown** text.
</markdown>
```

That question would be rendered like this:

```html
<h1>Hello, world!</h1>
<p>This is some <strong>Markdown</strong> text.</p>
```

A few special behaviors have been added to enable Markdown to work better within the PrairieLearn ecosystem, as described below.

## Markdown code blocks

Fenced code blocks (those using triple-backticks <code>\`\`\`</code>) are rendered as `<pl-code>` elements, which will then be rendered as usual by PrairieLearn. These blocks support specifying language and highlighted lines, which are then passed to the resulting `<pl-code>` element. Consider the following markdown:

`````html
<markdown>
```cpp{1-2,4}
int i = 1;
int j = 2;
int k = 3;
int m = 4;
```
</markdown>
`````

This will be rendered to the following `<pl-code>` element (which itself will eventually be rendered to standard HTML):

```html
<pl-code language="cpp" highlight-lines="1-2,4">
int i = 1;
int j = 2;
int k = 3;
int m = 4;
</pl-code>
```

## Escaping `<markdown>` tags

Under the hood, PrairieLearn is doing some very simple parsing to determine what pieces of a question to process as Markdown: it finds an opening `<markdown>` tag and processes everything up to the closing `</markdown>` tag. But what if you want to have a literal `<markdown>` or `</markdown>` tag in your question? PrairieLearn defines a special escape syntax to enable this. If you have `<markdown#>` or `</markdown#>` in a Markdown block, they will be renderd as `<markdown>` and `</markdown>` respectively (but will not be used to find regions of text to process as Markdown). You can use more hashes to produce different strings: for instance, to have `<markdown###>` show up in the output, write `<markdown####>` in your question.

## Rendering panels from `question.html`

When a question is displayed to a student, there are three "panels" that will be shown at different stages: the "question" panel, the "submission" panel, and the "answer" panel. These display the question prompt, the solution provided by the student, and the correct answer.

All three panels display the same `question.html` template, but elements will render differently in each panel. For example, the `<pl-number-input>` element displays an input box in the "question" panel, the submitted answer in the "submissions" panel, and the correct answer in the "answer" panel.

Text in `question.html` can be set to only display in the "question" panel by wrapping it in the `<pl-question-panel>` element. This is useful for the question prompt, which doesn't need to be repeated in the "submission" and "answer" panels. There are also elements that only render in the other two panels.

## How questions are rendered

Questions are rendered in two possible ways: with the "legacy renderer" and the "new renderer". Currently, the legacy renderer is the default, but the new renderer will eventually replace the legacy renderer entirely. The new renderer uses a different HTML parser, which behaves differently than the old one for malformed HTML and could result in breaking changes.

**TL;DR** If you're starting a new course, you should write questions with the new renderer in mind, as it will soon become the default.

> Aside: when we say "renderer", we're really talking about how we traverse the tree of elements in a question to process them. However, the way in which this occurs typically only matters during the "render" phase, so we talk about it as a "renderer".

### The legacy renderer

The legacy renderer uses a naive approach to rendering: it renders elements in order of name. This poses some performance problems: if an element will never actually have its output rendered on screen (for instance, it's inside a `<pl-question-panel>` and the current panel being rendered is the "answer" panel), it's possible that we'll still perform some expensive IPC to try to render a panel that will never be shown! Internally, the architecture provides inconsistent support for nested elements. For instance, if you wanted to use figures in multiple choice answers, they may not be rendered correctly:

```html
<pl-multiple-choice>
  <pl-answer correct="true">
    <pl-figure file-name="fig1.png">
  </pl-answer>
  <pl-answer correct="false">
    <pl-figure file-name="fig2.png">
  </pl-answer>
</pl-multiple-choice>
```

Based on the order that the elements get rendered, the inner `<pl-figure>` elements might not get processed correctly. This is due to behavior in a dependency called [cheerio](https://github.com/cheeriojs/cheerio) that we use to build up the rendered HTML for a question. One benefit of this dependency is that its parser is more forgiving when encountering invalid HTML. However, this also made it more difficult to process the question properly as a tree. Which brings us to...

### The new renderer

The new renderer is rewritten from the ground up to solve the problems inherent in the old renderer. Questions are now properly processed like a tree in a deterministic order. Let's reconsider the example above:

```html
<pl-multiple-choice answers-name="student">
  <pl-answer correct="true">
    <pl-figure file-name="fig1.png"></pl-figure>
  </pl-answer>
  <pl-answer correct="false">
    <pl-figure file-name="fig2.png"></pl-figure>
  </pl-answer>
</pl-multiple-choice>
```

If you imagine this being parsed into an abstract syntax tree, we have a `<pl-multiple-choice>` element with two `<pl-answer>` children elements, each of which has a `<pl-figure>` child element. When rendering this question, we first render the `<pl-multiple-choice>` element, which will produce some hypothetical markup that wraps each answer:

```html
<div class="foo">
  <input type="radio" name="student">
  <pl-figure file-name="fig1.png"></pl-figure>
</div>
<div class="foo">
  <input type="radio" name="student">
  <pl-figure file-name="fig2.png"></pl-figure>
</div>
```

We then re-parse this tree and again begin looking for more elements to render. We'll then come across each `<pl-figure>` in turn and they will be rendered, with their markup re-inserted into the tree:

```html
<div class="foo">
  <input type="radio" name="student">
  <img src="fig1.png">
</div>
<div class="foo">
  <input type="radio" name="student">
  <img src="fig2.png">
</div>
```

And then we're done! This is an obviously more correct way to process questions, and it will soon become the default. However, this change required introducing a new HTML parser that behaves differently in the presence of malformed HTML, such as missing closing tags or self-closing PrairieLearn elements. So, we are making this new renderer opt-in for the time being until we can ensure that everyone's questions have been properly updated.

To opt in to the new renderer, add the following to your `infoCourse.json` file:

```json
{
    "options": {
        "useNewQuestionRenderer": true
    },
}
```

Note that this will apply to all questions, so make sure to check that you've been writing valid HTML.

Example of invalid HTML:

```html
<p>This is a picture of a bird
<pl-figure file-name="bird.html"/>
```

Example of valid HTML:

```html
<p>This is a picture of a bird</p>
<pl-figure file-name="bird.html"></pl-figure>
```

## Options for grading student answers

For most [elements] there are four different ways of grading the student answer. This applies to elements like [`pl-number-input`](elements/#pl-number-input-element) and [`pl-string-input`](elements/#pl-string-input-element) that allow students to input an answer of their choosing, but not [`pl-multiple-choice`](elements/#pl-multiple-choice-element) or [`pl-checkbox`](elements/#pl-checkbox-element) that are much more constrained. The three ways are:

1. Set the correct answer using the correct-answer attribute in `question.html`. This is for hard-coded, fixed answers. We normally want some degree of randomization of the question, so this is the least-used method.

2. Set `data["correct_answers"][VAR_NAME]` in server.py. This is for questions where you can pre-compute a single correct answer based on the (randomized) parameters.

3. Write a [custom `grade(data)`](#question-serverpy) function in server.py that checks `data["submitted_answers"][VAR_NAME]` and sets scores. This can do anything, including having multiple correct answers, testing properties of the submitted answer for correctness, compute correct answers of some elements based on the value of other elements, etc.

4. Write an [external grader](externalGrading), though this is typically applied to more complex questions like coding.

If a question has more than one of the above options, each of them overrides the one before it. Even if options 3 (custom grade function) or 4 (external grader) are used, then it can still be helpful to set a correct answer so that it is shown to students as a sample of what would be accepted. If there are multiple correct answers then it's probably a good idea to add a note with [`pl-answer-panel`](elements/#pl-answer-panel-element) that any correct answer would be accepted and this displayed answer is only an example.

