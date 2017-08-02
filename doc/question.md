
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
<pl_question_panel>
  <p> A particle of mass $m = {{params.m}}\rm\ kg$ is observed to have acceleration $a = {{params.a}}\rm\ m/s^2$.
  <p> What is the total force $F$ currently acting on the particle?
</pl_question_panel>

<p>$F = $ <pl_number_input answers_name="F" comparison="sigfig" digits="2" /> $\rm m/s^2$
```

The `question.html` is regular HTML, with two special features:

1. Any text in double-curly-braces (like `{{params.m}}`) is substituted with variable values. This is using [Mustache](https://mustache.github.io/mustache.5.html) templating.

2. Special HTML elements (like `<pl_number_input>`) enable input and formatted output. See the [list of PrairieLearn elements](elements.md).


## Rendering panels from `question.html`

When a question is displayed to a student, there are three "panels" that will be shown at different stages: the "question" panel, the "submission" panel, and the "answer" panel. These display the question prompt, the solution provided by the student, and the correct answer.

All three panels display the same `question.html` template, but elements will render differently in each panel. For example, the `<pl_number_input>` element displays an input box in the "question" panel, the submitted answer in the "submissions" panel, and the corretc answer in the "answer" panel.

Text in `question.html` can be set to only display in the "question" panel by wrapping it in the `<pl_question_panel>` element. This is useful for the question prompt, which doesn't need to be repeated in the "submission" and "answer" panels. There are also elements that only render in the other two panels.
