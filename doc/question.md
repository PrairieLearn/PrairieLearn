
# Questions

**NOTE:** Any time you edit a question `info.json` file on a local copy of PrairieLearn, you need to click “Load from disk” to reload the changes. Edits to HTML or Python files can be picked up by reloading the page. You might need to generate a new variant of a question to run new Python code.

## Directory structure

Questions are all stored inside the main `questions` directory for a course. Each question is a single directory that contains all the files for that question. The name of the question directory is the question ID label (the `id`) for that question. For example, here are two different questions:

```text
questions
|
|-- fossilFuelsRadio          # first question, id is "fossilFuelsRadio"
|   |
|   +-- info.json             # metadata for the fossilFuelsRadio question
|   +-- server.py             # secret server-side code (optional)
|   `-- question.html         # HTML template for the question
|
`-- addVectors                # second question, id is "addVectors"
    |
    +-- info.json             # metadata for the addVectors question
    +-- server.py
    +-- question.html
    +-- notes.docx            # more files, like notes on how the question works
    +-- solution.docx         # these are secret (can't be seen by students)
    |
    +-- clientFilesQuestion/  # Files accessible to the client (web browser)
    |   `-- fig1.png          # A client file (an image)
    |
    +-- tests/                # external grading files (see other doc)
        `-- ...
```

PrairieLearn assumes independent questions; nothing ties them together. However, each question could have multiple parts (inputs that are validated together).

Example questions are in the [`exampleCourse/questions`](https://github.com/PrairieLearn/PrairieLearn/blob/master/exampleCourse/questions) directory inside PrairieLearn.


## Question `info.json`

The `info.json` file for each question defines properties of the question. For example, for the `addVectors` question:

```json
{
    "uuid": "cef0cbf3-6458-4f13-a418-ee4d7e7505dd",
    "title": "Addition of vectors in Cartesian coordinates",
    "topic": "Vectors",
    "tags": ["Cartesian", "graphical"],
    "type": "v3"
}
```

- `title` gives a student-visible title for the question.
- `topic` is the part of the course that this question belongs to (like the chapter in a textbook).
- `tags` (optional) stores any other aspects of the questions, for sorting and searching (these can be anything).
- `clientFiles` (optional) lists the files that the client (student's webbrowser) can access. Anything in here should be considered viewable by the student.
- `type` specifies the question format and should be `"v3"` for the current PrairieLearn question format.

## Partial credit

By default all v3 questions award partial credit. For example, if there are two numeric answers in a question and only one of them is correct then the student will be awarded 50% of the available points.

To disable partial credit for a question, set `"partialCredit": false` in the `info.json` file for the question. This will mean that the question will either give 0% or 100%, and it will only give 100% if every element on the page is fully correct.

## Question `server.py`

The `server.py` file for each question creates randomized question variants by generating random parameters and the corresponding correct answer. A complete `server.py` example looks like:

```python
import random

def generate(data):
    # random mass (m) and acceleration (a)
    m = random.randint(3, 10)
    a = random.randint(3, 9)
    data["params"]["m"] = m
    data["params"]["a"] = a

    # correct force
    F = m * a
    data["correct_answers"]["F"] = F

    return data

```

## Question `question.html`

The `question.html` is a template used to render the question to the student. A complete `question.html` example looks like:

```html
<pl-question-panel>
  <p> A particle of mass $m = {{params.m}}\rm\ kg$ is observed to have acceleration $a = {{params.a}}\rm\ m/s^2$.
  <p> What is the total force $F$ currently acting on the particle?
</pl-question-panel>

<p>$F = $ <pl-number-input answers_name="F" comparison="sigfig" digits="2" /> $\rm m/s^2$
```

The `question.html` is regular HTML, with two special features:

1. Any text in double-curly-braces (like `{{params.m}}`) is substituted with variable values. This is using [Mustache](https://mustache.github.io/mustache.5.html) templating.

2. Special HTML elements (like `<pl-number-input>`) enable input and formatted output. See the [list of PrairieLearn elements](elements.md).


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
